import { Inject, Injectable } from '@nestjs/common';
import { ATTENDANCE_POLICY_KIND, DEFAULT_ATTENDANCE_POLICY, PunchType } from '@sa/domain';
import { APP_CONFIG, AppConfig } from '../config';
import { DbService } from '../db/db.service';
import { AuditMeta, AuditService } from '../common/audit.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { PoliciesService } from '../common/policies.service';
import { Principal, branchScope } from '../common/principal';
import { SessionsService } from './sessions.service';
import { PeriodsService } from './periods.service';
import { recordScope } from './scope';

export type ExceptionRequest =
  | { kind: 'DECISION_OVERRIDE'; event_id: string; reason: string }
  | { kind: 'MISSING_PUNCH'; punch_type: PunchType; punch_at: string; reason: string };

const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class ExceptionsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly policies: PoliciesService,
    private readonly sessions: SessionsService,
    private readonly periods: PeriodsService,
  ) {}

  private tenantOf(p: Principal): string {
    if (!p.tenantId) throw forbidden();
    return p.tenantId;
  }

  /** الموظف يطلب استثناءً على حدثه، أو يسجل بصمة منسية ضمن النافذة المسموحة. */
  async request(p: Principal, dto: ExceptionRequest, meta: AuditMeta, now: Date = new Date()) {
    if (!p.employeeId) throw forbidden();
    const employeeId = p.employeeId;
    const tenantId = this.tenantOf(p);
    return this.db.tenantTx(tenantId, async (tx) => {
      const policy = await this.policies.current(tx, ATTENDANCE_POLICY_KIND, DEFAULT_ATTENDANCE_POLICY, now);
      const earliest = now.getTime() - policy.values.exception_window_days * DAY_MS;

      if (dto.kind === 'DECISION_OVERRIDE') {
        const ev = (
          await tx.query<{ id: string; server_time: Date; decision: string }>(
            `SELECT e.id, e.server_time, d.decision FROM attendance_events e JOIN attendance_decisions d ON d.event_id = e.id
             WHERE e.id = $1 AND e.employee_id = $2`,
            [dto.event_id, employeeId],
          )
        ).rows[0];
        if (!ev) throw notFound();
        if (ev.decision !== 'PENDING_REVIEW' && ev.decision !== 'REJECTED') throw conflict('EXCEPTION_NOT_APPLICABLE');
        if (new Date(ev.server_time).getTime() < earliest) throw conflict('EXCEPTION_OUT_OF_WINDOW');
        const existing = (
          await tx.query(
            `SELECT 1 FROM attendance_exceptions WHERE event_id = $1 AND status IN ('OPEN', 'APPROVED')`,
            [dto.event_id],
          )
        ).rowCount;
        if (existing) throw conflict('EXCEPTION_ALREADY_OPEN');
      } else {
        const at = new Date(dto.punch_at).getTime();
        if (at > now.getTime()) throw badRequest('VALIDATION_FAILED', { field: 'punch_at', reason: 'in the future' });
        if (at < earliest) throw conflict('EXCEPTION_OUT_OF_WINDOW');
      }

      const row = (
        await tx.query<{ id: string; status: string; created_at: Date }>(
          `INSERT INTO attendance_exceptions (tenant_id, employee_id, kind, event_id, punch_type, punch_at, reason, requested_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status, created_at`,
          [
            tenantId, employeeId, dto.kind,
            dto.kind === 'DECISION_OVERRIDE' ? dto.event_id : null,
            dto.kind === 'MISSING_PUNCH' ? dto.punch_type : null,
            dto.kind === 'MISSING_PUNCH' ? dto.punch_at : null,
            dto.reason, p.userId,
          ],
        )
      ).rows[0]!;
      await this.audit.record(tx, meta, { action: 'attendance.exception.requested', entityType: 'attendance_exception', entityId: row.id, after: { kind: dto.kind } });
      return row;
    });
  }

  /** الموظف يرى طلباته، والمدير يرى طلبات فروعه، وHR والإدارة كل العميل. */
  list(p: Principal, status?: string) {
    const scope = recordScope(p);
    return this.db.tenantTx(this.tenantOf(p), async (tx) =>
      (
        await tx.query(
          `SELECT x.id, x.employee_id, e.employee_number, e.full_name, e.branch_id, x.kind, x.event_id,
                  x.punch_type, x.punch_at, x.reason, x.status, x.created_at, x.decided_at, x.decision_note
           FROM attendance_exceptions x JOIN employees e ON e.id = x.employee_id
           WHERE ($1::uuid IS NULL OR x.employee_id = $1)
             AND ($2::uuid[] IS NULL OR e.branch_id = ANY($2))
             AND ($3::text IS NULL OR x.status = $3)
           ORDER BY x.created_at DESC LIMIT 200`,
          [scope.employeeId, scope.branchIds, status ?? null],
        )
      ).rows,
    );
  }

  /**
   * اعتماد أو رفض. مدير الفرع خارج فرعه: 403 (F17). لا أحد يعتمد استثناءه (F7).
   * الاعتماد يكتب التسوية ويعيد بناء الجلسات في المعاملة نفسها.
   */
  async decide(p: Principal, id: string, action: 'approve' | 'reject', note: string | undefined, meta: AuditMeta, now: Date = new Date()) {
    const tenantId = this.tenantOf(p);
    return this.db.tenantTx(tenantId, async (tx) => {
      const ex = (
        await tx.query<{
          id: string; employee_id: string; kind: string; event_id: string | null; punch_type: PunchType | null;
          punch_at: Date | null; status: string; requested_by: string; branch_id: string | null;
        }>(
          `SELECT x.id, x.employee_id, x.kind, x.event_id, x.punch_type, x.punch_at, x.status, x.requested_by, e.branch_id
           FROM attendance_exceptions x JOIN employees e ON e.id = x.employee_id WHERE x.id = $1 FOR UPDATE OF x`,
          [id],
        )
      ).rows[0];
      if (!ex) throw notFound();

      const scope = branchScope(p);
      if (scope !== null && (!ex.branch_id || !scope.includes(ex.branch_id))) throw forbidden();
      if (ex.requested_by === p.userId || p.employeeId === ex.employee_id) throw forbidden('EXCEPTION_SELF_DECISION');
      if (ex.status !== 'OPEN') throw conflict('EXCEPTION_NOT_OPEN');

      if (action === 'approve') {
        // F15: فترة مقفلة لا تُعدَّل إلا بعد إعادة فتحها.
        await this.periods.assertDayOpen(tx, await this.periods.dayOfException(tx, ex.id));
        if (ex.kind === 'DECISION_OVERRIDE') {
          await tx.query(
            `INSERT INTO attendance_adjustments (tenant_id, employee_id, exception_id, effect, event_id, approved_by)
             VALUES ($1, $2, $3, 'ACCEPT_EVENT', $4, $5)`,
            [tenantId, ex.employee_id, ex.id, ex.event_id, p.userId],
          );
        } else {
          await tx.query(
            `INSERT INTO attendance_adjustments (tenant_id, employee_id, exception_id, effect, punch_type, punch_at, approved_by)
             VALUES ($1, $2, $3, 'ADD_PUNCH', $4, $5, $6)`,
            [tenantId, ex.employee_id, ex.id, ex.punch_type, ex.punch_at, p.userId],
          );
        }
        await this.sessions.rebuild(tx, tenantId, ex.employee_id, now);
      }

      const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
      await tx.query(
        'UPDATE attendance_exceptions SET status = $2, decided_by = $3, decided_at = $4, decision_note = $5 WHERE id = $1',
        [id, status, p.userId, now, note ?? null],
      );
      await this.audit.record(tx, meta, {
        action: `attendance.exception.${action === 'approve' ? 'approved' : 'rejected'}`,
        entityType: 'attendance_exception',
        entityId: id,
        before: { status: 'OPEN' },
        after: { status },
      });
      return { id, status };
    });
  }
}

