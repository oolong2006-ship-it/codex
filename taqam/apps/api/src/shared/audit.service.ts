import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { serialize } from '../common/serialize';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  constructor(private readonly prisma: PrismaService) {}

  /** Records a mutation. Never throws (audit must not break the business action). */
  async log(user: Pick<AuthUser, 'id' | 'name' | 'companyId'>, action: string, entity: string, entityId?: string | null, data?: unknown) {
    try {
      await this.prisma.auditLog.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          userName: user.name,
          action,
          entity,
          entityId: entityId ?? null,
          data: data === undefined ? Prisma.JsonNull : (serialize(data) as Prisma.InputJsonValue),
        },
      });
    } catch (e) {
      this.logger.warn(`audit log failed: ${(e as Error).message}`);
    }
  }
}
