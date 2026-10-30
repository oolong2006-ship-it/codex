/**
 * Nonconformity & Corrective Action (CAPA).
 * OPEN → CONTAINED → (analysis + actions) ACTION_PLANNED → (all actions done) IMPLEMENTED
 *   → effectiveness EFFECTIVE → CLOSED | INEFFECTIVE → CONTAINED (new cycle)
 * CONTAINED → CLOSED (correction only) — MINOR severity only, with justification.
 * All action/verification timestamps are server-side; nothing can be backdated.
 */
import { z } from "zod";
import type { Db } from "../db";
import { DomainError } from "../errors";
import { can } from "../rbac";
import type { DocContent } from "../docs/writer";
import { audit, tx, type TenantCtx } from "./tenant";

export const NC_SOURCES = ["CUSTOMER_COMPLAINT", "INTERNAL_AUDIT", "EXTERNAL_AUDIT", "INSPECTION", "SUPPLIER", "PROCESS_MONITORING", "EMPLOYEE_REPORT", "OTHER"] as const;
export const SEVERITIES = ["MINOR", "MAJOR", "CRITICAL"] as const;

const todayIso = () => new Date().toISOString().slice(0, 10);
const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);

export const reportSchema = z.object({
  title: text(5, 200, "العنوان قصير جداً"),
  description: text(10, 4000, "الوصف قصير جداً — صف ما حدث وأين ومتى"),
  source: z.enum(NC_SOURCES),
  severity: z.enum(SEVERITIES),
  detectedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح").refine((d) => d <= todayIso(), "لا يمكن أن يكون تاريخ الاكتشاف في المستقبل"),
  processCode: z.string().trim().max(20).optional().or(z.literal("")),
  siteId: z.string().uuid().optional().or(z.literal("")),
  projectId: z.string().uuid().optional().or(z.literal("")),
});

async function nextCode(db: Db, ctx: TenantCtx): Promise<string> {
  const year = new Date().getUTCFullYear();
  const key = `NC-${year}`;
  const { rows } = await db.query(
    `INSERT INTO org_counters (org_id, key, value) VALUES ($1,$2,1)
     ON CONFLICT (org_id, key) DO UPDATE SET value = org_counters.value + 1 RETURNING value`,
    [ctx.orgId, key],
  );
  return `${key}-${String(rows[0].value).padStart(4, "0")}`;
}

async function loadNc(db: Db, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError("NOT_FOUND", "الحالة غير موجودة");
  const nc = (await db.query("SELECT * FROM nonconformities WHERE id = $1 FOR UPDATE", [id])).rows[0];
  if (!nc) throw new DomainError("NOT_FOUND", "الحالة غير موجودة");
  return nc;
}

function requireStatus(nc: { status: string }, ...allowed: string[]) {
  if (!allowed.includes(nc.status)) throw new DomainError("ILLEGAL_TRANSITION", `الإجراء غير متاح في الحالة الحالية (${nc.status})`);
}

export async function reportNc(ctx: TenantCtx, input: z.input<typeof reportSchema>): Promise<{ id: string; code: string }> {
  const d = reportSchema.parse(input);
  return tx(ctx, "nc.report", async (db) => {
    if (d.siteId && !(await db.query("SELECT 1 FROM sites WHERE id = $1", [d.siteId])).rowCount) throw new DomainError("VALIDATION", "موقع غير صالح");
    if (d.projectId && !(await db.query("SELECT 1 FROM projects WHERE id = $1", [d.projectId])).rowCount) throw new DomainError("VALIDATION", "مشروع غير صالح");
    const code = await nextCode(db, ctx);
    const { rows } = await db.query(
      `INSERT INTO nonconformities (org_id, project_id, code, source, severity, process_code, site_id, title, description, detected_on, reported_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [ctx.orgId, d.projectId || null, code, d.source, d.severity, d.processCode || null, d.siteId || null, d.title, d.description, d.detectedOn, ctx.userId],
    );
    await audit(db, ctx, "nc.reported", "nonconformity", rows[0].id, { code, severity: d.severity, source: d.source });
    return { id: rows[0].id, code };
  });
}

export async function recordContainment(ctx: TenantCtx, id: string, containment: string) {
  const c = text(10, 4000, "صف إجراء الاحتواء الفوري (10 أحرف على الأقل)").parse(containment);
  await tx(ctx, "nc.manage", async (db) => {
    const nc = await loadNc(db, id);
    requireStatus(nc, "OPEN");
    await db.query("UPDATE nonconformities SET containment = $1, containment_by = $2, containment_at = now(), status = 'CONTAINED' WHERE id = $3", [c, ctx.userId, id]);
    await audit(db, ctx, "nc.contained", "nonconformity", id);
  });
}

export const analysisSchema = z.object({
  method: z.enum(["FIVE_WHYS", "FISHBONE", "OTHER"]),
  whys: z.array(z.string().trim().max(1000)).max(7).default([]),
  rootCause: text(15, 4000, "صف السبب الجذري بوضوح (15 حرفاً على الأقل)"),
});

export async function recordAnalysis(ctx: TenantCtx, id: string, input: z.input<typeof analysisSchema>) {
  const d = analysisSchema.parse(input);
  const whys = d.whys.filter(Boolean);
  if (d.method === "FIVE_WHYS" && whys.length < 2) throw new DomainError("VALIDATION", "طريقة «لماذا الخمسة» تتطلب سؤالين على الأقل");
  await tx(ctx, "nc.manage", async (db) => {
    const nc = await loadNc(db, id);
    requireStatus(nc, "CONTAINED");
    const exists = await db.query("SELECT 1 FROM nc_analyses WHERE nc_id = $1 AND cycle = $2", [id, nc.cycle]);
    if (exists.rowCount) throw new DomainError("CONFLICT", "سُجّل تحليل لهذه الدورة؛ التحليل سجل غير قابل للتعديل");
    await db.query(
      `INSERT INTO nc_analyses (org_id, nc_id, cycle, method, whys, root_cause, analyzed_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ctx.orgId, id, nc.cycle, d.method, JSON.stringify(whys), d.rootCause, ctx.userId],
    );
    await audit(db, ctx, "nc.analyzed", "nonconformity", id, { cycle: nc.cycle, method: d.method });
  });
}

export const actionSchema = z.object({
  description: text(10, 2000, "صف الإجراء التصحيحي (10 أحرف على الأقل)"),
  ownerId: z.string().uuid("اختر المسؤول"),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح").refine((d) => d >= todayIso(), "الموعد المستهدف لا يكون في الماضي"),
});

/** Adding the first action after analysis moves the case to ACTION_PLANNED. */
export async function addAction(ctx: TenantCtx, ncId: string, input: z.input<typeof actionSchema>): Promise<string> {
  const d = actionSchema.parse(input);
  return tx(ctx, "nc.manage", async (db) => {
    const nc = await loadNc(db, ncId);
    requireStatus(nc, "CONTAINED", "ACTION_PLANNED");
    const analysis = await db.query("SELECT 1 FROM nc_analyses WHERE nc_id = $1 AND cycle = $2", [ncId, nc.cycle]);
    if (!analysis.rowCount) throw new DomainError("GATE_BLOCKED", "سجّل تحليل السبب الجذري قبل تحديد الإجراءات التصحيحية");
    const member = await db.query("SELECT 1 FROM memberships WHERE org_id = $1 AND user_id = $2", [ctx.orgId, d.ownerId]);
    if (!member.rowCount) throw new DomainError("VALIDATION", "المسؤول ليس عضواً في المنشأة");
    const { rows } = await db.query(
      `INSERT INTO corrective_actions (org_id, nc_id, cycle, description, owner_id, due_on, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ctx.orgId, ncId, nc.cycle, d.description, d.ownerId, d.dueOn, ctx.userId],
    );
    if (nc.status === "CONTAINED") await db.query("UPDATE nonconformities SET status = 'ACTION_PLANNED' WHERE id = $1", [ncId]);
    await audit(db, ctx, "capa.action_added", "nonconformity", ncId, { actionId: rows[0].id, ownerId: d.ownerId, dueOn: d.dueOn });
    return rows[0].id;
  });
}

async function maybeImplemented(db: Db, ncId: string, cycle: number) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE status = 'PLANNED')::int AS open, count(*) FILTER (WHERE status = 'DONE')::int AS done
     FROM corrective_actions WHERE nc_id = $1 AND cycle = $2`,
    [ncId, cycle],
  );
  if (rows[0].open === 0 && rows[0].done > 0) await db.query("UPDATE nonconformities SET status = 'IMPLEMENTED' WHERE id = $1 AND status = 'ACTION_PLANNED'", [ncId]);
}

/** The action owner (or a CAPA manager) records completion with a note of what was done. */
export async function completeAction(ctx: TenantCtx, actionId: string, note: string) {
  const n = text(10, 2000, "صف ما تم تنفيذه فعلاً ومكان الدليل (10 أحرف على الأقل)").parse(note);
  await tx(ctx, "read", async (db) => {
    const a = (await db.query("SELECT * FROM corrective_actions WHERE id = $1 FOR UPDATE", [actionId])).rows[0];
    if (!a) throw new DomainError("NOT_FOUND", "الإجراء غير موجود");
    if (a.owner_id !== ctx.userId && !can(ctx.role, "nc.manage")) throw new DomainError("FORBIDDEN", "فقط مسؤول الإجراء أو مدير الجودة يسجل الإنجاز");
    if (ctx.role === "VIEWER") throw new DomainError("FORBIDDEN", "صلاحية اطلاع فقط");
    if (a.status !== "PLANNED") throw new DomainError("ILLEGAL_TRANSITION", "الإجراء منتهٍ مسبقاً");
    await db.query("UPDATE corrective_actions SET status = 'DONE', completion_note = $1, completed_by = $2, completed_at = now() WHERE id = $3", [n, ctx.userId, actionId]);
    await maybeImplemented(db, a.nc_id, a.cycle);
    await audit(db, ctx, "capa.action_done", "nonconformity", a.nc_id, { actionId });
  });
}

export async function cancelAction(ctx: TenantCtx, actionId: string, reason: string) {
  const r = text(5, 1000, "اذكر سبب الإلغاء").parse(reason);
  await tx(ctx, "nc.manage", async (db) => {
    const a = (await db.query("SELECT * FROM corrective_actions WHERE id = $1 FOR UPDATE", [actionId])).rows[0];
    if (!a) throw new DomainError("NOT_FOUND", "الإجراء غير موجود");
    if (a.status !== "PLANNED") throw new DomainError("ILLEGAL_TRANSITION", "الإجراء منتهٍ مسبقاً");
    const active = await db.query("SELECT count(*)::int AS n FROM corrective_actions WHERE nc_id = $1 AND cycle = $2 AND status <> 'CANCELLED' AND id <> $3", [a.nc_id, a.cycle, actionId]);
    if (active.rows[0].n === 0) throw new DomainError("CONFLICT", "لا يمكن إلغاء الإجراء الوحيد؛ أضف بديلاً أولاً");
    await db.query("UPDATE corrective_actions SET status = 'CANCELLED', cancel_reason = $1 WHERE id = $2", [r, actionId]);
    await maybeImplemented(db, a.nc_id, a.cycle);
    await audit(db, ctx, "capa.action_cancelled", "nonconformity", a.nc_id, { actionId, reason: r });
  });
}

export const verifySchema = z.object({
  result: z.enum(["EFFECTIVE", "INEFFECTIVE"]),
  method: text(5, 1000, "صف طريقة التحقق (مثلاً: مراجعة سجلات الاستلام لشهر)"),
  evidence: text(15, 4000, "صف الدليل الذي تم فحصه فعلاً (15 حرفاً على الأقل)"),
});

/**
 * Independent effectiveness verification: the verifier must not own any completed action in this cycle.
 * INEFFECTIVE reopens the case for a new analysis cycle.
 */
export async function verifyEffectiveness(ctx: TenantCtx, ncId: string, input: z.input<typeof verifySchema>) {
  const d = verifySchema.parse(input);
  await tx(ctx, "capa.verify", async (db) => {
    const nc = await loadNc(db, ncId);
    requireStatus(nc, "IMPLEMENTED");
    const owns = await db.query("SELECT 1 FROM corrective_actions WHERE nc_id = $1 AND cycle = $2 AND status = 'DONE' AND (owner_id = $3 OR completed_by = $3)", [ncId, nc.cycle, ctx.userId]);
    if (owns.rowCount) throw new DomainError("SEGREGATION_OF_DUTIES", "لا يجوز لمنفذ الإجراء التحقق من فاعليته؛ يلزم شخص مستقل");
    await db.query(
      `INSERT INTO effectiveness_checks (org_id, nc_id, cycle, result, method, evidence_note, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [ctx.orgId, ncId, nc.cycle, d.result, d.method, d.evidence, ctx.userId],
    );
    if (d.result === "EFFECTIVE") {
      await db.query("UPDATE nonconformities SET status = 'CLOSED', closure_type = 'EFFECTIVE_CAPA', closed_by = $1, closed_at = now() WHERE id = $2", [ctx.userId, ncId]);
      await audit(db, ctx, "capa.verified_effective", "nonconformity", ncId, { cycle: nc.cycle });
    } else {
      await db.query("UPDATE nonconformities SET status = 'CONTAINED', cycle = cycle + 1 WHERE id = $1", [ncId]);
      await audit(db, ctx, "capa.verified_ineffective", "nonconformity", ncId, { cycle: nc.cycle, reopenedAsCycle: nc.cycle + 1 });
    }
  });
}

/** Correction without corrective action — MINOR only, with a written justification. */
export async function closeCorrectionOnly(ctx: TenantCtx, ncId: string, justification: string) {
  const j = text(15, 2000, "اذكر مسوغ الاكتفاء بالتصحيح (15 حرفاً على الأقل)").parse(justification);
  await tx(ctx, "nc.manage", async (db) => {
    const nc = await loadNc(db, ncId);
    requireStatus(nc, "CONTAINED");
    if (nc.severity !== "MINOR") throw new DomainError("GATE_BLOCKED", "الحالات الكبرى والحرجة تتطلب إجراءً تصحيحياً وتحققاً من الفاعلية");
    if ((await db.query("SELECT 1 FROM corrective_actions WHERE nc_id = $1 AND status <> 'CANCELLED'", [ncId])).rowCount) {
      throw new DomainError("CONFLICT", "توجد إجراءات تصحيحية؛ أكمل مسار التحقق من الفاعلية");
    }
    await db.query("UPDATE nonconformities SET status = 'CLOSED', closure_type = 'CORRECTION_ONLY', closure_note = $1, closed_by = $2, closed_at = now() WHERE id = $3", [j, ctx.userId, ncId]);
    await audit(db, ctx, "nc.closed_correction_only", "nonconformity", ncId, { justification: j });
  });
}

// ───────────── Queries ─────────────

export async function listNcs(ctx: TenantCtx, filter: { status?: string } = {}) {
  return tx(ctx, "read", async (db) => {
    const { rows } = await db.query(
      `SELECT n.id, n.code, n.title, n.source, n.severity, n.status, n.cycle, n.detected_on, n.reported_at, n.process_code, s.name AS site_name,
              (SELECT count(*)::int FROM corrective_actions a WHERE a.nc_id = n.id AND a.status = 'PLANNED' AND a.due_on < current_date) AS overdue
       FROM nonconformities n LEFT JOIN sites s ON s.id = n.site_id
       WHERE ($1::text IS NULL OR n.status = $1) ORDER BY n.reported_at DESC`,
      [filter.status ?? null],
    );
    return rows;
  });
}

export async function capaMetrics(ctx: TenantCtx) {
  return tx(ctx, "read", async (db) => {
    const { rows } = await db.query(
      `SELECT count(*) FILTER (WHERE status <> 'CLOSED')::int AS open,
              count(*) FILTER (WHERE closure_type = 'EFFECTIVE_CAPA')::int AS closed_effective,
              count(*) FILTER (WHERE closure_type = 'CORRECTION_ONLY')::int AS closed_correction,
              count(*) FILTER (WHERE cycle > 1)::int AS reopened,
              (SELECT count(*)::int FROM corrective_actions WHERE status = 'PLANNED' AND due_on < current_date) AS overdue_actions
       FROM nonconformities`,
    );
    return rows[0] as { open: number; closed_effective: number; closed_correction: number; reopened: number; overdue_actions: number };
  });
}

export async function getNc(ctx: TenantCtx, id: string) {
  return tx(ctx, "read", async (db) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DomainError("NOT_FOUND", "الحالة غير موجودة");
    const nc = (
      await db.query(
        `SELECT n.*, s.name AS site_name, r.full_name AS reporter_name, c.full_name AS containment_name, cl.full_name AS closer_name
         FROM nonconformities n LEFT JOIN sites s ON s.id = n.site_id JOIN users r ON r.id = n.reported_by
         LEFT JOIN users c ON c.id = n.containment_by LEFT JOIN users cl ON cl.id = n.closed_by WHERE n.id = $1`,
        [id],
      )
    ).rows[0];
    if (!nc) throw new DomainError("NOT_FOUND", "الحالة غير موجودة");
    const analyses = (await db.query("SELECT a.*, u.full_name AS analyst_name FROM nc_analyses a JOIN users u ON u.id = a.analyzed_by WHERE nc_id = $1 ORDER BY cycle", [id])).rows;
    const actions = (
      await db.query(
        `SELECT a.*, o.full_name AS owner_name, c.full_name AS completer_name FROM corrective_actions a JOIN users o ON o.id = a.owner_id
         LEFT JOIN users c ON c.id = a.completed_by WHERE nc_id = $1 ORDER BY cycle, created_at`,
        [id],
      )
    ).rows;
    const checks = (await db.query("SELECT e.*, u.full_name AS verifier_name FROM effectiveness_checks e JOIN users u ON u.id = e.performed_by WHERE nc_id = $1 ORDER BY cycle", [id])).rows;
    const timeline = (
      await db.query(
        `SELECT l.action, l.at, l.data, u.full_name AS actor_name FROM tenant_audit_logs l LEFT JOIN users u ON u.id = l.actor_id
         WHERE l.entity_type = 'nonconformity' AND l.entity_id = $1 ORDER BY l.at`,
        [id],
      )
    ).rows;
    const org = (await db.query("SELECT name FROM organizations WHERE id = $1", [ctx.orgId])).rows[0];
    return { nc, analyses, actions, checks, timeline, orgName: org.name as string };
  });
}

// ───────────── Report (digital record of form QM-FRM-001) ─────────────

export const SOURCE_AR: Record<string, string> = {
  CUSTOMER_COMPLAINT: "شكوى عميل", INTERNAL_AUDIT: "تدقيق داخلي", EXTERNAL_AUDIT: "تدقيق خارجي", INSPECTION: "فحص/تفتيش",
  SUPPLIER: "مورد", PROCESS_MONITORING: "مراقبة العملية", EMPLOYEE_REPORT: "بلاغ موظف", OTHER: "أخرى",
};
export const SEVERITY_AR: Record<string, string> = { MINOR: "بسيطة", MAJOR: "كبرى", CRITICAL: "حرجة" };
export const NC_STATUS_AR: Record<string, string> = {
  OPEN: "مفتوحة", CONTAINED: "تم الاحتواء", ACTION_PLANNED: "إجراءات مخططة", IMPLEMENTED: "بانتظار التحقق من الفاعلية", CLOSED: "مغلقة",
};
const fmt = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "—");

export function ncReportContent(r: Awaited<ReturnType<typeof getNc>>): DocContent {
  const { nc, analyses, actions, checks } = r;
  return {
    sections: [
      {
        heading: "بيانات الحالة",
        paragraphs: [],
        table: {
          headers: ["البند", "القيمة"],
          rows: [
            ["الرمز", nc.code], ["العنوان", nc.title], ["المصدر", SOURCE_AR[nc.source]], ["الخطورة", SEVERITY_AR[nc.severity]],
            ["العملية", nc.process_code ?? "—"], ["الموقع", nc.site_name ?? "—"], ["تاريخ الاكتشاف", String(nc.detected_on instanceof Date ? nc.detected_on.toISOString().slice(0, 10) : nc.detected_on)],
            ["أبلغ عنها", `${nc.reporter_name} — ${fmt(nc.reported_at)}`], ["الحالة", NC_STATUS_AR[nc.status]], ["دورة التحليل", String(nc.cycle)],
          ],
        },
      },
      { heading: "الوصف", paragraphs: [nc.description] },
      { heading: "الاحتواء الفوري", paragraphs: [nc.containment ? `${nc.containment} — ${nc.containment_name} (${fmt(nc.containment_at)})` : "لم يُسجل بعد"] },
      ...analyses.map((a) => ({
        heading: `تحليل السبب الجذري — الدورة ${a.cycle}`,
        paragraphs: [...(a.whys as string[]).map((w, i) => `لماذا ${i + 1}: ${w}`), `السبب الجذري: ${a.root_cause}`, `المحلل: ${a.analyst_name} (${fmt(a.analyzed_at)})`],
      })),
      {
        heading: "الإجراءات التصحيحية",
        paragraphs: actions.length ? [] : ["لا توجد إجراءات"],
        table: actions.length
          ? {
              headers: ["الدورة", "الإجراء", "المسؤول", "الموعد", "الحالة", "ما تم تنفيذه"],
              rows: actions.map((a) => [String(a.cycle), a.description, a.owner_name, new Date(a.due_on).toISOString().slice(0, 10), { PLANNED: "مخطط", DONE: "منفذ", CANCELLED: "ملغى" }[a.status as string] ?? a.status, a.status === "DONE" ? `${a.completion_note} — ${a.completer_name} (${fmt(a.completed_at)})` : a.cancel_reason ?? "—"]),
            }
          : undefined,
      },
      {
        heading: "التحقق من الفاعلية",
        paragraphs: checks.length ? [] : ["لم يُنفذ بعد"],
        table: checks.length
          ? { headers: ["الدورة", "النتيجة", "الطريقة", "الدليل", "المتحقق", "التاريخ"], rows: checks.map((c) => [String(c.cycle), c.result === "EFFECTIVE" ? "فعّال" : "غير فعّال", c.method, c.evidence_note, c.verifier_name, fmt(c.performed_at)]) }
          : undefined,
      },
      {
        heading: "الإغلاق",
        paragraphs: [
          nc.status === "CLOSED"
            ? `${nc.closure_type === "EFFECTIVE_CAPA" ? "أُغلقت بعد التحقق من فاعلية الإجراءات" : `أُغلقت بالتصحيح فقط: ${nc.closure_note}`} — ${nc.closer_name} (${fmt(nc.closed_at)})`
            : "الحالة غير مغلقة",
          "جميع التواريخ والأسماء في هذا التقرير مسجلة آلياً لحظة تنفيذ كل خطوة في المنصة.",
        ],
      },
    ],
  };
}

/** Options for forms: members (action owners), sites, and processes from the organization's projects. */
export async function capaFormOptions(ctx: TenantCtx) {
  return tx(ctx, "read", async (db) => ({
    members: (await db.query("SELECT u.id, u.full_name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 AND m.role <> 'VIEWER' ORDER BY u.full_name", [ctx.orgId])).rows as { id: string; full_name: string }[],
    sites: (await db.query("SELECT id, name FROM sites ORDER BY is_head_office DESC, name")).rows as { id: string; name: string }[],
    processes: (await db.query("SELECT DISTINCT ON (code) code, name_ar FROM processes ORDER BY code, project_id")).rows as { code: string; name_ar: string }[],
  }));
}
