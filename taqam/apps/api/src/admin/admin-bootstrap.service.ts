import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

/** Production bootstrap: PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD create or refresh a SUPER_ADMIN on boot. */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('PlatformAdmin');
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.PLATFORM_ADMIN_PASSWORD;
    if (!email || !password) return;
    if (password.length < 8) {
      this.logger.warn('PLATFORM_ADMIN_PASSWORD must be at least 8 characters — skipped');
      return;
    }
    try {
      const existing = await this.prisma.user.findUnique({ where: { email } });
      const passwordHash = await bcrypt.hash(password, 10);
      if (!existing) {
        await this.prisma.user.create({ data: { email, name: process.env.PLATFORM_ADMIN_NAME || 'مدير المنصة', role: 'SUPER_ADMIN', companyId: null, passwordHash } });
        this.logger.log(`created platform admin ${email}`);
      } else if (existing.role === 'SUPER_ADMIN') {
        await this.prisma.user.update({ where: { id: existing.id }, data: { passwordHash, isActive: true } });
        this.logger.log(`refreshed platform admin ${email}`);
      } else {
        this.logger.warn(`${email} belongs to a company user — platform admin not created`);
      }
    } catch (e) {
      this.logger.error(`platform admin bootstrap failed: ${(e as Error).message}`);
    }
  }
}
