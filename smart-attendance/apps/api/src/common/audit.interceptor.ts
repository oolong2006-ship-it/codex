import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import { DbService } from '../db/db.service';
import { AuditService, auditMeta } from './audit.service';
import type { AuthedRequest } from './principal';

export const AUDITED = 'sa:audited';
export interface AuditedMeta {
  action: string;
  entityType: string;
}
/** يعلّم مسار كتابة حساسًا. النجاح تسجله الخدمة داخل معاملتها؛ والرفض يسجله هذا الـ interceptor. */
export const Audited = (action: string, entityType: string) =>
  SetMetadata(AUDITED, { action, entityType } satisfies AuditedMeta);

/**
 * يسجل محاولات الكتابة الحساسة المرفوضة (403/409) — مثل محاولة تفعيل جهاز بديل
 * دون موافقة (F6) أو اعتماد الموظف طلبه بنفسه (F7) — لأنها دليل بحد ذاتها.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditInterceptor');

  constructor(
    private readonly reflector: Reflector,
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditedMeta | undefined>(AUDITED, ctx.getHandler());
    if (!meta) return next.handle();
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return next.handle().pipe(
      catchError((err: unknown) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        if (status !== 403 && status !== 409) return throwError(() => err);
        const m = auditMeta(req);
        const code = err instanceof HttpException ? (err.getResponse() as { code?: string }).code : undefined;
        const write = (tx: Parameters<AuditService['record']>[0]) =>
          this.audit.record(tx, m, {
            action: `${meta.action}.denied`,
            entityType: meta.entityType,
            entityId: typeof req.params?.id === 'string' ? req.params.id : null,
            after: { status, error_code: code ?? null },
          });
        const op = m.tenantId ? this.db.tenantTx(m.tenantId, write) : this.db.platformTx(write);
        return from(
          op.catch((e: Error) => this.logger.error(`audit of denied attempt failed: ${e.message}`)),
        ).pipe(mergeMap(() => throwError(() => err)));
      }),
    );
  }
}
