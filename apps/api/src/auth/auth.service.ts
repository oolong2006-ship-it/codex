import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE_PERMISSIONS, ROLES, RoleKey } from '../common/rbac';
import { AuthenticatedUser } from '../common/types';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private accessTtl(): number {
    return Number(process.env.JWT_ACCESS_TTL ?? 900);
  }

  private refreshTtl(): number {
    return Number(process.env.JWT_REFRESH_TTL ?? 604800);
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { roles: { include: { role: true } } },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Account temporarily locked. Try again later.');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed,
          lockedUntil:
            failed >= MAX_FAILED_LOGINS
              ? new Date(Date.now() + LOCK_MINUTES * 60_000)
              : null,
        },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'DISABLED') {
      throw new ForbiddenException('Account disabled');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return user;
  }

  private buildPermissions(roleKeys: string[]): string[] {
    const set = new Set<string>();
    for (const key of roleKeys) {
      const perms = ROLE_PERMISSIONS[key as RoleKey] ?? [];
      perms.forEach((p) => set.add(p));
    }
    return [...set];
  }

  async issueTokens(
    userId: string,
    email: string,
    organizationId: string | null,
    roleKeys: string[],
    context?: { userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    const isSuperAdmin = roleKeys.includes(ROLES.SUPER_ADMIN);
    const payload = {
      sub: userId,
      email,
      organizationId,
      roles: roleKeys,
      isSuperAdmin,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: this.accessTtl(),
    });
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: 'refresh' },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: this.refreshTtl() },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        userAgent: context?.userAgent,
        ipAddress: context?.ipAddress,
        expiresAt: new Date(Date.now() + this.refreshTtl() * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  async login(
    email: string,
    password: string,
    context?: { userAgent?: string; ipAddress?: string },
  ) {
    const user = await this.validateUser(email, password);
    const roleKeys = user.roles.map((r) => r.role.key);
    const tokens = await this.issueTokens(
      user.id,
      user.email,
      user.organizationId,
      roleKeys,
      context,
    );

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'login',
        resource: 'auth',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        arabicName: user.arabicName,
        organizationId: user.organizationId,
        roles: roleKeys,
        permissions: this.buildPermissions(roleKeys),
      },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let decoded: { sub: string };
    try {
      decoded = await this.jwt.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const sessions = await this.prisma.session.findMany({
      where: { userId: decoded.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    let matched = null;
    for (const s of sessions) {
      if (await bcrypt.compare(refreshToken, s.refreshTokenHash)) {
        matched = s;
        break;
      }
    }
    if (!matched) {
      throw new UnauthorizedException('Session not found or expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new UnauthorizedException('User not found');

    // rotate: revoke old session
    await this.prisma.session.update({
      where: { id: matched.id },
      data: { revokedAt: new Date() },
    });

    const roleKeys = user.roles.map((r) => r.role.key);
    return this.issueTokens(user.id, user.email, user.organizationId, roleKeys);
  }

  async logout(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  /** Loads a full authenticated-user context for guards from a verified access token payload. */
  async buildAuthUser(payload: {
    sub: string;
    email: string;
    organizationId: string | null;
    roles: string[];
    isSuperAdmin: boolean;
  }): Promise<AuthenticatedUser> {
    return {
      id: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      roles: payload.roles,
      permissions: this.buildPermissions(payload.roles),
      isSuperAdmin: payload.isSuperAdmin,
    };
  }
}
