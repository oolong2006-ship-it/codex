import { Injectable } from '@nestjs/common';
import {
  ATTENDANCE_POLICY_KIND,
  DEFAULT_ATTENDANCE_POLICY,
  Occurrence,
  SessionFact,
  ShiftOutcome,
  ShiftTemplate,
  evaluateOccurrence,
  formatLocalDateTime,
  shiftOccurrences,
} from '@sa/domain';
import { DbService, Tx } from '../db/db.service';
import { AuditMeta, AuditService } from '../common/audit.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { PoliciesService } from '../common/policies.service';
import { Principal } from '../common/principal';
import { recordScope } from './scope';

const DEFAULT_TIMEZONE = 'Asia/Riyadh';
/** حد تقني لحجم التقرير، لا قاعدة نظامية. */
const MAX_REPORT_DAYS = 92;
const DAY_MS = 24 * 3600 * 1000;

export interface TemplateInput {
  name: string;
  start_time: string;
  end_time: string;
  days: number[];
}

interface AssignmentRow {
  employee_id: string;
  employee_number: string;
  full_name: string;
  branch_id: string | null;
  shift_name: string;
  start_time: string;
  end_time: string;
  days: number[];
  valid_from: string;
  valid_to: string | null;
}

export interface ShiftReportRow {
  employee_number: string;
  full_name: string;
  branch_id: string | null;
  shift: string;
  date: string;
  scheduled_start: Date;
  scheduled_end: Date;
  outcome: ShiftOutcome;
  late_minutes: number;
  early_leave_minutes: number;
  started_at: Date | null;
  ended_at: Date | null;
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly policies: PoliciesService,
  ) {}

  private tenantOf(p: Principal): string {
    if (!p.tenantId) throw forbidden();
    return p.tenantId;
  }

  async createTemplate(p: Principal, input: TemplateInput, meta: AuditMeta) {
    const tenantId = this.tenantOf(p);
    const days = [...new Set(input.days)].sort((a, b) => a - b);
    return this.db.tenantTx(tenantId, async (tx) => {
      const row = (
        await tx.query(
          `INSERT INTO shift_templates (tenant_id, name, start_time, end_time, days) VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, start_time, end_time, days, status`,
          [tenantId, input.name, input.start_time, input.end_time, days],
        )
      ).rows[0];
      await this.audit.record(tx, meta, { action: 'shift.template.created', entityType: 'shift_template', entityId: row.id, after: row });
      return row;
    });
  }

  listTemplates(p: Principal) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) =>
      (await tx.query('SELECT id, name, start_time, end_time, days, status FROM shift_templates ORDER BY name')).rows,
    );
  }

  /** تعيين وردية لموظف بنافذة صلاحية؛ لا يتداخل مع تعيين آخر له. */
  async assign(
    p: Principal,
    employeeId: string,
    input: { shift_template_id: string; valid_from: string; valid_to?: string },
    meta: AuditMeta,
  ) {
    const tenantId = this.tenantOf(p);
    return this.db.tenantTx(tenantId, async (tx) => {
      const employee = (await tx.query('SELECT id FROM employees WHERE id = $1', [employeeId])).rows[0];
      if (!employee) throw notFound();
      const template = (await tx.query("SELECT id FROM shift_templates WHERE id = $1 AND status = 'ACTIVE'", [input.shift_template_id])).rows[0];
      if (!template) throw notFound();
      if (input.valid_to && input.valid_to < input.valid_from) throw badRequest('VALIDATION_FAILED', { field: 'valid_to' });

      const overlap = (
        await tx.query(
          `SELECT 1 FROM shift_assignments
           WHERE employee_id = $1 AND valid_from <= COALESCE($3::date, '9999-12-31'::date)
             AND COALESCE(valid_to, '9999-12-31'::date) >= $2::date`,
          [employeeId, input.valid_from, input.valid_to ?? null],
        )
      ).rowCount;
      if (overlap) throw conflict('SHIFT_OVERLAP');

      const row = (
        await tx.query(
          `INSERT INTO shift_assignments (tenant_id, employee_id, shift_template_id, valid_from, valid_to, created_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, employee_id, shift_template_id, valid_from, valid_to`,
          [tenantId, employeeId, input.shift_template_id, input.valid_from, input.valid_to ?? null, p.userId],
        )
      ).rows[0];
      await this.audit.record(tx, meta, { action: 'shift.assignment.created', entityType: 'shift_assignment', entityId: row.id, after: row });
      return row;
    });
  }

  /**
   * تقرير الورديات لفترة: لكل يوم مجدول حكم واحد (في الوقت، متأخر، خروج مبكر، غائب،
   * جلسة غير مكتملة، أو لم يحن موعده). الموظف يرى نفسه، ومدير الفرع فرعه.
   */
  async report(
    p: Principal,
    filter: { from: string; to: string; employeeId?: string },
    now: Date = new Date(),
  ): Promise<{ timeZone: string; rows: ShiftReportRow[] }> {
    const tenantId = this.tenantOf(p);
    const scope = recordScope(p);
    const days = (Date.parse(`${filter.to}T00:00:00Z`) - Date.parse(`${filter.from}T00:00:00Z`)) / DAY_MS;
    if (days < 0) throw badRequest('VALIDATION_FAILED', { field: 'to', reason: 'before from' });
    if (days > MAX_REPORT_DAYS) throw badRequest('VALIDATION_FAILED', { field: 'to', reason: `at most ${MAX_REPORT_DAYS} days` });

    return this.db.tenantTx(tenantId, async (tx) => {
      const tz = await this.timezone(tx, tenantId);
      const policy = await this.policies.current(tx, ATTENDANCE_POLICY_KIND, DEFAULT_ATTENDANCE_POLICY, now);
      const grace = { lateMinutes: policy.values.late_grace_minutes, earlyLeaveMinutes: policy.values.early_leave_grace_minutes };

      const assignments = (
        await tx.query<AssignmentRow>(
          `SELECT a.employee_id, e.employee_number, e.full_name, e.branch_id, t.name AS shift_name,
                  t.start_time, t.end_time, t.days, a.valid_from, a.valid_to
           FROM shift_assignments a
           JOIN shift_templates t ON t.id = a.shift_template_id
           JOIN employees e ON e.id = a.employee_id
           WHERE a.valid_from <= $2::date AND COALESCE(a.valid_to, '9999-12-31'::date) >= $1::date
             AND ($3::uuid IS NULL OR a.employee_id = $3)
             AND ($4::uuid[] IS NULL OR e.branch_id = ANY($4))`,
          [filter.from, filter.to, scope.employeeId ?? filter.employeeId ?? null, scope.branchIds],
        )
      ).rows;
      if (!assignments.length) return { timeZone: tz, rows: [] };

      const sessions = await tx.query<{ employee_id: string; business_date: string; started_at: Date; ended_at: Date | null; status: SessionFact['status'] }>(
        `SELECT employee_id, business_date, started_at, ended_at, status FROM attendance_sessions
         WHERE employee_id = ANY($1::uuid[]) AND business_date BETWEEN $2::date AND $3::date`,
        [[...new Set(assignments.map((a) => a.employee_id))], filter.from, filter.to],
      );
      const byEmployee = new Map<string, SessionFact[]>();
      for (const s of sessions.rows) {
        const list = byEmployee.get(s.employee_id) ?? [];
        list.push({ businessDate: s.business_date, startedAt: s.started_at, endedAt: s.ended_at, status: s.status });
        byEmployee.set(s.employee_id, list);
      }

      const rows: ShiftReportRow[] = [];
      for (const a of assignments) {
        const template: ShiftTemplate = { startTime: a.start_time, endTime: a.end_time, days: a.days };
        const occurrences: Occurrence[] = shiftOccurrences(template, { validFrom: a.valid_from, validTo: a.valid_to }, filter.from, filter.to, tz);
        for (const occ of occurrences) {
          const result = evaluateOccurrence(occ, byEmployee.get(a.employee_id) ?? [], now, grace);
          rows.push({
            employee_number: a.employee_number,
            full_name: a.full_name,
            branch_id: a.branch_id,
            shift: a.shift_name,
            date: occ.date,
            scheduled_start: result.start,
            scheduled_end: result.end,
            outcome: result.outcome,
            late_minutes: result.lateMinutes,
            early_leave_minutes: result.earlyLeaveMinutes,
            started_at: result.startedAt,
            ended_at: result.endedAt,
          });
        }
      }
      return { timeZone: tz, rows: rows.sort((x, y) => x.date.localeCompare(y.date) || x.employee_number.localeCompare(y.employee_number)) };
    });
  }

  /** صفوف التقرير بأوقات محلية للعميل، للتصدير CSV. */
  async reportForExport(p: Principal, filter: { from: string; to: string; employeeId?: string }, now: Date = new Date()) {
    const { timeZone, rows } = await this.report(p, filter, now);
    return rows.map((r) => ({
      employee_number: r.employee_number,
      full_name: r.full_name,
      shift: r.shift,
      date: r.date,
      scheduled_start: formatLocalDateTime(r.scheduled_start, timeZone),
      scheduled_end: formatLocalDateTime(r.scheduled_end, timeZone),
      outcome: r.outcome,
      late_minutes: r.late_minutes,
      early_leave_minutes: r.early_leave_minutes,
      started_at: r.started_at ? formatLocalDateTime(r.started_at, timeZone) : '',
      ended_at: r.ended_at ? formatLocalDateTime(r.ended_at, timeZone) : '',
    }));
  }

  private async timezone(tx: Tx, tenantId: string): Promise<string> {
    const row = (await tx.query<{ timezone: string }>('SELECT timezone FROM tenant_settings WHERE tenant_id = $1', [tenantId])).rows[0];
    return row?.timezone ?? DEFAULT_TIMEZONE;
  }
}
