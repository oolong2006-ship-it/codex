import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../common/types';

const orgRoom = (organizationId: string) => `org:${organizationId}`;
// setTimeout overflows (and fires immediately) above 2^31-1 ms.
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Broadcasts live operational updates to connected dashboards / control rooms.
 * Every socket must present a valid access token at connect time, and is placed in its
 * own organization's room only. Super admins may additionally join any org room.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/realtime' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('EventsGateway');
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwt: JwtService,
    private readonly authService: AuthService,
  ) {}

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) return this.reject(client, 'Missing access token');

    let payload: Parameters<AuthService['buildAuthUser']>[0] & { exp?: number };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_ACCESS_SECRET });
    } catch {
      return this.reject(client, 'Invalid or expired token');
    }

    const user = await this.authService.buildAuthUser(payload);
    // The client may have dropped while the token was being verified.
    if (!client.connected) return;
    client.data.user = user;
    if (user.organizationId) client.join(orgRoom(user.organizationId));

    // The token's lifetime bounds the connection's: reconnecting requires a fresh token.
    if (payload.exp) {
      const ms = Math.min(Math.max(payload.exp * 1000 - Date.now(), 0), MAX_TIMER_MS);
      this.expiryTimers.set(
        client.id,
        setTimeout(() => this.reject(client, 'Token expired'), ms),
      );
    }
  }

  handleDisconnect(client: Socket) {
    const timer = this.expiryTimers.get(client.id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(client.id);
  }

  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() data: { organizationId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user as AuthenticatedUser | undefined;
    const requested = typeof data?.organizationId === 'string' ? data.organizationId : undefined;
    if (!user || !requested) return { joined: null, error: 'forbidden' };
    if (!user.isSuperAdmin && requested !== user.organizationId) {
      this.logger.warn(`user ${user.id} denied join to org:${requested}`);
      return { joined: null, error: 'forbidden' };
    }
    client.join(orgRoom(requested));
    return { joined: requested };
  }

  emitToOrg(organizationId: string, event: string, payload: unknown) {
    this.server?.to(orgRoom(organizationId)).emit(event, payload);
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth) return fromAuth;
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }

  private reject(client: Socket, reason: string) {
    client.emit('auth:error', { message: reason });
    client.disconnect(true);
  }
}
