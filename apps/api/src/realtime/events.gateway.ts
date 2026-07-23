import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

/**
 * Broadcasts live operational updates to connected dashboards / control rooms.
 * Clients join an organization room so tenants only receive their own stream.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/realtime' })
export class EventsGateway {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger('EventsGateway');

  @SubscribeMessage('join')
  handleJoin(
    @MessageBody() data: { organizationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (data?.organizationId) {
      client.join(`org:${data.organizationId}`);
      this.logger.debug(`socket ${client.id} joined org:${data.organizationId}`);
    }
    return { joined: data?.organizationId ?? null };
  }

  emitToOrg(organizationId: string, event: string, payload: unknown) {
    this.server?.to(`org:${organizationId}`).emit(event, payload);
  }

  broadcast(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }
}
