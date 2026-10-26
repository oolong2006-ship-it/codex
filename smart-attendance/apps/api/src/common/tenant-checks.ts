import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config';
import { notFound } from './errors';
import type { Principal } from './principal';

/**
 * الطبقة الثانية للعزل: فحص صريح في الخدمة بعد RLS (CLAUDE.md §3).
 * يُعطّل فقط في APP_ENV=test لإثبات أن RLS وحده يمنع التسرب.
 */
@Injectable()
export class TenantChecks {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** يرمي 404 (لا 403) كي لا يكشف وجود الكيان لدى عميل آخر. */
  assertOwned<T extends { tenant_id: string } | undefined>(principal: Principal, row: T): asserts row {
    if (!row) throw notFound();
    if (this.config.serviceTenantChecks && row.tenant_id !== principal.tenantId) throw notFound();
  }

  /** نطاق الفروع لمدير الفرع. */
  assertBranchInScope(scope: string[] | null, branchId: string | null): void {
    if (scope === null) return;
    if (!branchId || !scope.includes(branchId)) throw notFound();
  }
}
