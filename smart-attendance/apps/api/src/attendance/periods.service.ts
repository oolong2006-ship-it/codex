import { Injectable } from '@nestjs/common';
import { DbService, Tx } from '../db/db.service';
import { AuditMeta, AuditService } from '../common/audit.service';
import { conflict, forbidden, notFound } from '../common/errors';
import { Principal } from '../common/principal';

const DEFAULT_TIMEZONE = 'Asia/Riyadh';

/** أول يوم وآخر يوم للشهر (YYYY-MM). */
export function monthBounds(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const start = `${month}-01`;
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start, end: `${month}-${String(last).padStart(2, '0')}` };
}

@Injectable()
export class PeriodsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  private tenantOf(p: Principal): string {
    if (!p.tenantId) throw forbidden();
    return p.tenantId;
  }

  /** قفل الشهر: يُنشأ السجل إن لم يوجد، أو يُغلق المفتوح. */
  async lock(p: Principal, month: string, meta: AuditMeta, now: Date = new Date()) {
    const tenantId = this.tenantOf(p);
    const { start, end } = monthBounds(month);
    return this.db.tenantTx(tenantId, async (tx) => {
      const current = (await tx.query<{ id: string; status: string }>('SELECT id, status FROM payroll_periods WHERE period_start = $1', [start])).rows[0];
      if (current?.status === 'LOCKED' || current?.status === 'EXPORTED') throw conflict('PERIOD_ALREADY_LOCKED');
      const row = current
        ? (await tx.query('UPDATE payroll_periods SET status = $2, locked_at = $3, locked_by = $4 WHERE id = $1 RETURNING id, period_start, period_end, status', [current.id, 'LOCKED', now, p.userId])).rows[0]
        : (await tx.query(
            `INSERT INTO payroll_periods (tenant_id, period_start, period_end, status, locked_at, locked_by)
             VALUES ($1, $2, $3, 'LOCKED', $4, $5) RETURNING id, period_start, period_end, status`,
            [tenantId, start, end, now, p.userId],
          )).rows[0];
      await this.audit.record(tx, meta, { action: 'attendance.period.locked', entityType: 'payroll_period', entityId: row.id, before: { status: current?.status ?? null }, after: { status: 'LOCKED', month } });
      return row;
    });
  }

  /** إعادة فتح شهر مقفل. صلاحية خاصة وسبب مكتوب وسجل تدقيق. */
  async reopen(p: Principal, month: string, reason: string, meta: AuditMeta, now: Date = new Date()) {
    const tenantId = this.tenantOf(p);
    const { start } = monthBounds(month);
    return this.db.tenantTx(tenantId, async (tx) => {
      const current = (await tx.query<{ id: string; status: string }>('SELECT id, status FROM payroll_periods WHERE period_start = $1', [start])).rows[0];
      if (!current) throw notFound();
      if (current.status !== 'LOCKED') throw conflict('PERIOD_NOT_LOCKED');
      const row = (await tx.query(
        `UPDATE payroll_periods SET status = 'OPEN', reopened_at = $2, reopened_by = $3, reopen_reason = $4 WHERE id = $1
         RETURNING id, period_start, period_end, status`,
        [current.id, now, p.userId, reason],
      )).rows[0];
      await this.audit.record(tx, meta, { action: 'attendance.period.reopened', entityType: 'payroll_period', entityId: row.id, before: { status: 'LOCKED' }, after: { status: 'OPEN', reason } });
      return row;
    });
  }

  list(p: Principal) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) =>
      (await tx.query('SELECT id, period_start, period_end, status, locked_at, reopened_at, reopen_reason FROM payroll_periods ORDER BY period_start DESC LIMIT 60')).rows,
    );
  }

  /** يرفض أي تعديل على يوم يقع في فترة مقفلة (F15). */
  async assertDayOpen(tx: Tx, day: string): Promise<void> {
    const locked = (
      await tx.query('SELECT 1 FROM payroll_periods WHERE status <> \'OPEN\' AND $1::date BETWEEN period_start AND period_end', [day])
    ).rowCount;
    if (locked) throw conflict('PERIOD_LOCKED');
  }

  /** التاريخ التشغيلي (YYYY-MM-DD) لأثر طلب الاستثناء في منطقة العميل. */
  async dayOfException(tx: Tx, exceptionId: string): Promise<string> {
    const row = (
      await tx.query<{ day: string }>(
        `SELECT (COALESCE(e.server_time, x.punch_at) AT TIME ZONE COALESCE(ts.timezone, $2))::date::text AS day
         FROM attendance_exceptions x
         LEFT JOIN attendance_events e ON e.id = x.event_id
         LEFT JOIN tenant_settings ts ON ts.tenant_id = x.tenant_id
         WHERE x.id = $1`,
        [exceptionId, DEFAULT_TIMEZONE],
      )
    ).rows[0];
    return row?.day ?? new Date().toISOString().slice(0, 10);
  }
}
