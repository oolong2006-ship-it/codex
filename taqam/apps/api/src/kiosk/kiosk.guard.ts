import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformService } from '../platform/platform.service';
import { hashKioskToken, KioskContext, KIOSK_TOKEN_INVALID_AR } from './kiosk.service';

const TOKEN = /^[0-9a-f]{64}$/i;
/** lastSeenAt is refreshed at most once a minute (the screen polls). */
const SEEN_THROTTLE_MS = 60_000;

declare module 'express-serve-static-core' {
  interface Request {
    kiosk?: KioskContext;
  }
}

/**
 * Authenticates a paired branch kiosk by its X-Kiosk-Token (looked up by sha256). Unknown or revoked → 401 with
 * code KIOSK_TOKEN_INVALID (the screen then asks to be paired again). A suspended / expired company is blocked
 * exactly like its users. Kiosk routes are @Public() for the user JWT guard and protected by this guard instead.
 */
@Injectable()
export class KioskGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const raw = String(req.headers['x-kiosk-token'] ?? '').trim();
    const invalid = () => new UnauthorizedException({ message: 'Kiosk is not paired or was revoked', messageAr: KIOSK_TOKEN_INVALID_AR, code: 'KIOSK_TOKEN_INVALID' });
    if (!TOKEN.test(raw)) throw invalid();
    const k = await this.prisma.kioskDevice.findUnique({ where: { tokenHash: hashKioskToken(raw.toLowerCase()) }, include: { company: true } });
    if (!k || k.revokedAt) throw invalid();
    await this.platform.assertCompanyAccess(k.company);
    const now = new Date();
    if (!k.lastSeenAt || now.getTime() - k.lastSeenAt.getTime() > SEEN_THROTTLE_MS) {
      await this.prisma.kioskDevice.update({ where: { id: k.id }, data: { lastSeenAt: now } });
    }
    req.kiosk = { id: k.id, name: k.name, companyId: k.companyId, branchId: k.branchId };
    return true;
  }
}
