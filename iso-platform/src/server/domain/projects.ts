import { z } from "zod";
import type { Db } from "../db";
import { DomainError } from "../errors";
import {
  applicableQuestions,
  detectConflicts,
  findQuestion,
  nextQuestion,
  normaliseAnswer,
  progress,
  questionsFor,
  type Answers,
} from "../packs";
import { buildBlueprint, type Blueprint } from "./blueprint-engine";
import { enqueueJob } from "./jobs";
import { audit, tx, type TenantCtx } from "./tenant";

export async function defaultEdition(db: Db) {
  const { rows } = await db.query(
    `SELECT e.id, e.edition_label, e.status, e.published_on, e.verified_at, e.verification_source, e.transition_note, s.code
     FROM standard_editions e JOIN standards s ON s.id = e.standard_id
     WHERE s.code = 'ISO9001' AND e.is_default`,
  );
  if (!rows[0]) throw new DomainError("NOT_FOUND", "لا يوجد إصدار افتراضي مسجل لـ ISO 9001");
  return rows[0];
}

export async function licenseStatus(db: Db, editionId: string) {
  const { rows } = await db.query(
    `SELECT * FROM license_grants WHERE standard_edition_id = $1 AND status = 'ACTIVE'
       AND valid_from <= current_date AND (valid_to IS NULL OR valid_to >= current_date)
     ORDER BY created_at DESC LIMIT 1`,
    [editionId],
  );
  return { active: !!rows[0], grant: rows[0] ?? null };
}

export const projectSchema = z.object({
  title: z.string().trim().min(3).max(200),
  siteIds: z.array(z.string().uuid()).min(1, "اختر موقعاً واحداً على الأقل"),
});

export async function createProject(ctx: TenantCtx, input: z.input<typeof projectSchema>): Promise<string> {
  const d = projectSchema.parse(input);
  return tx(ctx, "project.manage", async (db) => {
    const ed = await defaultEdition(db);
    const validSites = await db.query("SELECT id FROM sites WHERE id = ANY($1::uuid[])", [d.siteIds]);
    if (validSites.rowCount !== d.siteIds.length) throw new DomainError("VALIDATION", "موقع غير صالح");
    const org = (await db.query("SELECT industry_code FROM organizations WHERE id = $1", [ctx.orgId])).rows[0];
    const { rows } = await db.query(
      `INSERT INTO projects (org_id, standard_edition_id, title, site_ids, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [ctx.orgId, ed.id, d.title, d.siteIds, ctx.userId],
    );
    const projectId = rows[0].id as string;
    await db.query(
      `INSERT INTO intake_sessions (org_id, project_id, industry_code, started_by) VALUES ($1,$2,$3,$4)`,
      [ctx.orgId, projectId, org.industry_code, ctx.userId],
    );
    await audit(db, ctx, "project.created", "project", projectId, { title: d.title, edition: `ISO9001:${ed.edition_label}` });
    return projectId;
  });
}

export async function listProjects(ctx: TenantCtx) {
  return tx(ctx, "read", async (db) => {
    const { rows } = await db.query(
      `SELECT p.id, p.title, p.status, p.created_at, e.edition_label FROM projects p
       JOIN standard_editions e ON e.id = p.standard_edition_id ORDER BY p.created_at DESC`,
    );
    return rows;
  });
}

async function loadProject(db: Db, projectId: string) {
  const { rows } = await db.query(
    `SELECT p.*, i.id AS intake_id, i.industry_code, i.status AS intake_status FROM projects p
     JOIN intake_sessions i ON i.project_id = p.id WHERE p.id = $1`,
    [projectId],
  );
  if (!rows[0]) throw new DomainError("NOT_FOUND", "المشروع غير موجود");
  return rows[0];
}

async function loadAnswers(db: Db, intakeId: string): Promise<Answers> {
  const { rows } = await db.query("SELECT question_id, value FROM answers WHERE intake_session_id = $1", [intakeId]);
  return Object.fromEntries(rows.map((r) => [r.question_id, r.value]));
}

export async function getProject(ctx: TenantCtx, projectId: string) {
  return tx(ctx, "read", async (db) => {
    const p = await loadProject(db, projectId);
    const ed = (await db.query("SELECT * FROM standard_editions WHERE id = $1", [p.standard_edition_id])).rows[0];
    const lic = await licenseStatus(db, p.standard_edition_id);
    return { ...p, edition: ed, license: lic, blueprint: p.blueprint as Blueprint | null };
  });
}

// ───────────── Intake (adaptive interview) ─────────────

export async function getIntakeState(ctx: TenantCtx, projectId: string) {
  return tx(ctx, "read", async (db) => {
    const p = await loadProject(db, projectId);
    const answers = await loadAnswers(db, p.intake_id);
    return intakeView(p, answers);
  });
}

function intakeView(p: { id: string; industry_code: string; intake_status: string; status: string }, answers: Answers) {
  const industry = p.industry_code;
  return {
    projectId: p.id,
    industry,
    projectStatus: p.status,
    status: p.intake_status,
    answers,
    questions: applicableQuestions(industry, answers),
    next: nextQuestion(industry, answers),
    progress: progress(industry, answers),
    conflicts: detectConflicts(industry, answers),
  };
}

export async function answerQuestion(ctx: TenantCtx, projectId: string, questionId: string, raw: unknown) {
  return tx(ctx, "intake.answer", async (db) => {
    const p = await loadProject(db, projectId);
    if (p.scope_approved_at) throw new DomainError("CONFLICT", "تم اعتماد النطاق؛ أي تغيير في الحقائق يتطلب مراجعة جديدة للنطاق");
    const q = findQuestion(p.industry_code, questionId);
    if (!q) throw new DomainError("VALIDATION", "سؤال غير معروف");
    const answers = await loadAnswers(db, p.intake_id);
    if (q.when && !q.when(answers)) throw new DomainError("VALIDATION", "هذا السؤال لا ينطبق على إجاباتك الحالية");
    let value;
    try {
      value = normaliseAnswer(q, raw);
    } catch (e) {
      throw new DomainError("VALIDATION", (e as Error).message);
    }
    await db.query(
      `INSERT INTO answers (org_id, intake_session_id, question_id, value, answered_by) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (intake_session_id, question_id) DO UPDATE SET value = EXCLUDED.value, answered_by = EXCLUDED.answered_by, answered_at = now()`,
      [ctx.orgId, p.intake_id, questionId, JSON.stringify(value), ctx.userId],
    );
    answers[questionId] = value;
    await syncFacts(db, ctx, p, answers);
    const done = nextQuestion(p.industry_code, answers) === null;
    await db.query("UPDATE intake_sessions SET status = $1, completed_at = $2 WHERE id = $3", [
      done ? "COMPLETED" : "IN_PROGRESS",
      done ? new Date() : null,
      p.intake_id,
    ]);
    await audit(db, ctx, "intake.answered", "answer", questionId, { projectId });
    return intakeView({ ...p, intake_status: done ? "COMPLETED" : "IN_PROGRESS" }, answers);
  });
}

/** Facts mirror answers with explicit provenance: CLIENT_PROVIDED / CONFLICTED / MISSING / NOT_APPLICABLE. */
async function syncFacts(db: Db, ctx: TenantCtx, p: { id: string; industry_code: string }, answers: Answers) {
  const industry = p.industry_code;
  const applicable = new Set(applicableQuestions(industry, answers).map((q) => q.id));
  const conflicted = new Set(
    detectConflicts(industry, answers)
      .filter((c) => c.level === "CONFLICT")
      .flatMap((c) => c.questionIds),
  );
  for (const q of questionsFor(industry)) {
    const v = answers[q.id];
    let status: string;
    if (!applicable.has(q.id)) status = v === undefined ? "" : "NOT_APPLICABLE";
    else if (v === undefined) status = q.critical ? "MISSING" : "";
    else status = conflicted.has(q.id) ? "CONFLICTED" : "CLIENT_PROVIDED";
    if (!status) {
      await db.query("DELETE FROM facts WHERE project_id = $1 AND key = $2 AND verified_at IS NULL", [p.id, q.id]);
      continue;
    }
    await db.query(
      `INSERT INTO facts (org_id, project_id, key, value, status, source_type, source_ref, owner_id)
       VALUES ($1,$2,$3,$4,$5,'INTERVIEW',$6,$7)
       ON CONFLICT (project_id, key) DO UPDATE SET
         value = EXCLUDED.value,
         status = CASE WHEN facts.status = 'VERIFIED' AND facts.value = EXCLUDED.value THEN 'VERIFIED'::provenance ELSE EXCLUDED.status END,
         verified_by = CASE WHEN facts.value = EXCLUDED.value THEN facts.verified_by END,
         verified_at = CASE WHEN facts.value = EXCLUDED.value THEN facts.verified_at END,
         updated_at = now()`,
      [ctx.orgId, p.id, q.id, v === undefined ? null : JSON.stringify(v), status, `question:${q.id}`, ctx.userId],
    );
  }
}

export async function listFacts(ctx: TenantCtx, projectId: string) {
  return tx(ctx, "read", async (db) => (await db.query("SELECT * FROM facts WHERE project_id = $1 ORDER BY key", [projectId])).rows);
}

export async function verifyFact(ctx: TenantCtx, factId: string, note: string) {
  if (!note.trim()) throw new DomainError("VALIDATION", "اذكر الدليل أو المرجع الذي تم التحقق منه");
  await tx(ctx, "scope.approve", async (db) => {
    const r = await db.query(
      `UPDATE facts SET status = 'VERIFIED', verified_by = $1, verified_at = now(), note = $2, source_type = 'REVIEWER'
       WHERE id = $3 AND status IN ('CLIENT_PROVIDED','INFERRED')`,
      [ctx.userId, note.trim().slice(0, 1000), factId],
    );
    if (!r.rowCount) throw new DomainError("CONFLICT", "لا يمكن التحقق من حقيقة متعارضة أو ناقصة");
    await audit(db, ctx, "fact.verified", "fact", factId, { note });
  });
}

// ───────────── Blueprint & scope ─────────────

export async function generateBlueprint(ctx: TenantCtx, projectId: string): Promise<Blueprint> {
  return tx(ctx, "blueprint.generate", async (db) => {
    const p = await loadProject(db, projectId);
    if (p.scope_approved_at) throw new DomainError("CONFLICT", "النطاق معتمد؛ لا يمكن إعادة توليد المخطط");
    const answers = await loadAnswers(db, p.intake_id);
    const org = (await db.query("SELECT name FROM organizations WHERE id = $1", [ctx.orgId])).rows[0];
    const sites = (await db.query("SELECT name FROM sites WHERE id = ANY($1::uuid[]) ORDER BY is_head_office DESC, name", [p.site_ids])).rows;
    const lic = await licenseStatus(db, p.standard_edition_id);
    const bp = buildBlueprint({
      industry: p.industry_code,
      answers,
      orgName: org.name,
      siteNames: sites.map((s) => s.name),
      licenseActive: lic.active,
    });
    if (!bp.gates.ready) {
      throw new DomainError("GATE_BLOCKED", "لا يمكن توليد المخطط قبل استكمال الحقائق الحرجة ومعالجة التعارضات", bp.gates);
    }
    await db.query("DELETE FROM processes WHERE project_id = $1", [projectId]);
    await db.query("DELETE FROM risks WHERE project_id = $1 AND status = 'HYPOTHESIS'", [projectId]);
    for (const [i, pr] of bp.processes.entries()) {
      await db.query(
        `INSERT INTO processes (org_id, project_id, code, name_ar, name_en, category, owner_role, inputs, outputs, kpis, provenance, rationale, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'INFERRED',$11,$12)`,
        [ctx.orgId, projectId, pr.code, pr.nameAr, pr.nameEn, pr.category, pr.ownerRole, JSON.stringify(pr.inputs), JSON.stringify(pr.outputs), JSON.stringify(pr.kpis), pr.rationale, i],
      );
    }
    for (const r of bp.risks) {
      await db.query(
        `INSERT INTO risks (org_id, project_id, process_code, kind, title, description, likelihood, impact, treatment, provenance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'INFERRED')`,
        [ctx.orgId, projectId, r.processCode, r.kind, r.title, r.description, r.likelihood, r.impact, r.treatment],
      );
    }
    await db.query(
      `UPDATE projects SET blueprint = $1, blueprint_version = blueprint_version + 1, status = 'BLUEPRINT', scope_statement = $2 WHERE id = $3`,
      [JSON.stringify(bp), bp.scopeStatement, projectId],
    );
    await audit(db, ctx, "blueprint.generated", "project", projectId, { engine: bp.engine, processes: bp.processes.length, documents: bp.documentPlan.length });
    return bp;
  });
}

export async function approveScope(ctx: TenantCtx, projectId: string, scopeStatement: string) {
  const text = scopeStatement.trim();
  if (text.length < 20) throw new DomainError("VALIDATION", "بيان النطاق قصير جداً");
  if (/\[MISSING:/.test(text)) throw new DomainError("GATE_BLOCKED", "بيان النطاق يحتوي بيانات ناقصة [MISSING]");
  await tx(ctx, "scope.approve", async (db) => {
    const p = await loadProject(db, projectId);
    if (p.status !== "BLUEPRINT") throw new DomainError("ILLEGAL_TRANSITION", "يجب توليد المخطط قبل اعتماد النطاق");
    const bp = p.blueprint as Blueprint;
    bp.scopeStatement = text;
    await db.query(
      `UPDATE projects SET scope_statement = $1, scope_approved_by = $2, scope_approved_at = now(), status = 'SCOPE_APPROVED', blueprint = $3 WHERE id = $4`,
      [text, ctx.userId, JSON.stringify(bp), projectId],
    );
    await db.query("UPDATE processes SET provenance = 'CLIENT_PROVIDED' WHERE project_id = $1", [projectId]);
    await audit(db, ctx, "scope.approved", "project", projectId, { scope: text });
  });
}

export async function listProcesses(ctx: TenantCtx, projectId: string) {
  return tx(ctx, "read", async (db) => (await db.query("SELECT * FROM processes WHERE project_id = $1 ORDER BY sort_order", [projectId])).rows);
}

export async function listRisks(ctx: TenantCtx, projectId: string) {
  return tx(ctx, "read", async (db) => (await db.query("SELECT * FROM risks WHERE project_id = $1 ORDER BY score DESC, created_at", [projectId])).rows);
}

export async function requestDocumentGeneration(ctx: TenantCtx, projectId: string) {
  return tx(ctx, "project.manage", async (db) => {
    const p = await loadProject(db, projectId);
    if (!["SCOPE_APPROVED", "DOCUMENTING"].includes(p.status)) {
      throw new DomainError("GATE_BLOCKED", "يجب اعتماد النطاق والهيكل قبل التوليد الشامل للوثائق");
    }
    const pending = await db.query(
      "SELECT id FROM jobs WHERE kind = 'generate_documents' AND status IN ('QUEUED','RUNNING') AND payload->>'projectId' = $1",
      [projectId],
    );
    if (pending.rowCount) return pending.rows[0].id as string;
    const jobId = await enqueueJob(db, ctx, "generate_documents", { projectId });
    await db.query("UPDATE projects SET status = 'DOCUMENTING' WHERE id = $1", [projectId]);
    await audit(db, ctx, "documents.generation_requested", "project", projectId, { jobId });
    return jobId;
  });
}
