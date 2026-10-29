import { Injectable } from '@nestjs/common';
import { ATTENDANCE_POLICY_KIND, DEFAULT_ATTENDANCE_POLICY, localDate, pairSessions } from '@sa/domain';
import type { SessionPunch } from '@sa/domain';
import { DbService, Tx } from '../db/db.service';
import { forbidden } from '../common/errors';
import { PoliciesService } from '../common/policies.service';
import { Principal } from '../common/principal';
import { recordScope } from './scope';

const DEFAULT_TIMEZONE = 'Asia/Riyadh';

@Injectable()
export class SessionsService {
  constructor(
    private readonly db: DbService,
    private readonly policies: PoliciesService,
  ) {}

  /**
   * يعيد بناء جلسات الموظف بالكامل من البصمات المقبولة (وغير المرفوضة) والتسويات.
   * الجلسات مشتقة: لا تُعدَّل يدويًا، بل تُعاد كتابتها بعد كل تغيير.
   */
  async rebuild(tx: Tx, tenantId: string, employeeId: string, now: Date): Promise<void> {
    const tz =
      (await tx.query<{ timezone: string }>('SELECT timezone FROM tenant_settings WHERE tenant_id = $1', [tenantId])).rows[0]
        ?.timezone ?? DEFAULT_TIMEZONE;
    const policy = await this.policies.current(tx, ATTENDANCE_POLICY_KIND, DEFAULT_ATTENDANCE_POLICY, now);
    const punches = (
      await tx.query<{ ref: string; type: SessionPunch['type']; at: Date }>(
        `SELECT 'event:' || e.id AS ref, e.type, e.server_time AS at
         FROM attendance_events e JOIN attendance_decisions d ON d.event_id = e.id
         WHERE e.employee_id = $1 AND (d.decision <> 'REJECTED' OR e.id IN (
           SELECT event_id FROM attendance_adjustments WHERE employee_id = $1 AND effect = 'ACCEPT_EVENT'))
         UNION ALL
         SELECT 'adjustment:' || a.id, a.punch_type, a.punch_at
         FROM attendance_adjustments a WHERE a.employee_id = $1 AND a.effect = 'ADD_PUNCH'`,
        [employeeId],
      )
    ).rows;

    const derived = pairSessions(punches, now, policy.values.max_session_hours);
    await tx.query('DELETE FROM attendance_sessions WHERE employee_id = $1', [employeeId]);
    if (!derived.length) return;
    // كل الصفوف في إدراج واحد.
    await tx.query(
      `INSERT INTO attendance_sessions (tenant_id, employee_id, business_date, status, started_at, ended_at, duration_minutes, start_ref, end_ref)
       SELECT $1, $2, u.bd::date, u.st, u.sa::timestamptz, u.ea::timestamptz, u.dm, u.sr, u.er
       FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::int[], $8::text[], $9::text[])
         AS u(bd, st, sa, ea, dm, sr, er)`,
      [
        tenantId,
        employeeId,
        derived.map((s) => localDate(s.startedAt, tz)),
        derived.map((s) => s.status),
        derived.map((s) => s.startedAt.toISOString()),
        derived.map((s) => (s.endedAt ? s.endedAt.toISOString() : null)),
        derived.map((s) => s.durationMinutes),
        derived.map((s) => s.startRef),
        derived.map((s) => s.endRef),
      ],
    );
  }

  /** جلسات ضمن النطاق والمرشح (تاريخ تشغيلي من/إلى). */
  listFor(p: Principal, filter: { employeeId?: string; from?: string; to?: string }) {
    const scope = recordScope(p);
    return this.db.tenantTx(this.tenantOf(p), async (tx) =>
      (
        await tx.query(
          `SELECT s.id, s.employee_id, e.employee_number, e.full_name, e.branch_id, s.business_date, s.status,
                  s.started_at, s.ended_at, s.duration_minutes
           FROM attendance_sessions s JOIN employees e ON e.id = s.employee_id
           WHERE ($1::uuid IS NULL OR s.employee_id = $1)
             AND ($2::uuid[] IS NULL OR e.branch_id = ANY($2))
             AND ($3::date IS NULL OR s.business_date >= $3::date)
             AND ($4::date IS NULL OR s.business_date <= $4::date)
           ORDER BY s.started_at DESC LIMIT 500`,
          [scope.employeeId ?? filter.employeeId ?? null, scope.branchIds, filter.from ?? null, filter.to ?? null],
        )
      ).rows,
    );
  }

  /** لوحة الحضور اللحظي: الحاضرون الآن (جلسات مفتوحة) وعدد البصمات المعلقة للمراجعة. */
  async roster(p: Principal) {
    const scope = recordScope(p);
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const present = (
        await tx.query(
          `SELECT s.employee_id, e.employee_number, e.full_name, e.branch_id, s.started_at
           FROM attendance_sessions s JOIN employees e ON e.id = s.employee_id
           WHERE s.status = 'OPEN' AND ($1::uuid[] IS NULL OR e.branch_id = ANY($1))
           ORDER BY s.started_at`,
          [scope.branchIds],
        )
      ).rows;
      const pending = (
        await tx.query<{ n: string }>(
          `SELECT count(*) AS n FROM attendance_decisions d
           JOIN attendance_events e ON e.id = d.event_id JOIN employees emp ON emp.id = e.employee_id
           WHERE d.decision = 'PENDING_REVIEW' AND e.server_time > now() - interval '24 hours'
             AND ($1::uuid[] IS NULL OR emp.branch_id = ANY($1))`,
          [scope.branchIds],
        )
      ).rows[0];
      return { present, pending_review_last_24h: Number(pending?.n ?? 0) };
    });
  }

  /** صفوف كشف شهر واحد بأوقات محلية للعميل، لتصدير CSV. */
  exportMonth(p: Principal, month: string) {
    const scope = recordScope(p);
    const [year, monthNumber] = month.split('-').map(Number) as [number, number];
    const monthStart = `${month}-01`;
    const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const tz =
        (await tx.query<{ timezone: string }>('SELECT timezone FROM tenant_settings WHERE tenant_id = $1', [p.tenantId])).rows[0]
          ?.timezone ?? DEFAULT_TIMEZONE;
      return (
        await tx.query(
          `SELECT e.employee_number, e.full_name, b.code AS branch_code, s.business_date, s.status,
                  to_char(s.started_at AT TIME ZONE $1, 'YYYY-MM-DD HH24:MI') AS started_at,
                  to_char(s.ended_at AT TIME ZONE $1, 'YYYY-MM-DD HH24:MI') AS ended_at,
                  s.duration_minutes
           FROM attendance_sessions s
           JOIN employees e ON e.id = s.employee_id
           LEFT JOIN branches b ON b.id = e.branch_id
           WHERE s.business_date >= $2::date AND s.business_date < $3::date
             AND ($4::uuid[] IS NULL OR e.branch_id = ANY($4))
             AND ($5::uuid IS NULL OR s.employee_id = $5)
           ORDER BY e.employee_number, s.started_at`,
          [tz, monthStart, nextMonth, scope.branchIds, scope.employeeId],
        )
      ).rows;
    });
  }

  private tenantOf(p: Principal): string {
    if (!p.tenantId) throw forbidden();
    return p.tenantId;
  }
}
