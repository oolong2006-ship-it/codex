import { createHash } from "node:crypto";
import type { Db } from "../db";
import { DomainError } from "../errors";
import { findPlaceholders, writeDocument, WRITER_ID, type DocContent, type DocSection } from "../docs/writer";
import type { Blueprint } from "./blueprint-engine";
import { registerJobHandler } from "./jobs";
import { audit, tx, type TenantCtx } from "./tenant";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hashContent = (c: DocContent) => sha256(JSON.stringify(c));

// ───────────── Generation (job handler) ─────────────

registerJobHandler("generate_documents", async (db, job) => {
  const projectId = String(job.payload.projectId);
  const p = (await db.query("SELECT * FROM projects WHERE id = $1", [projectId])).rows[0];
  if (!p || !p.scope_approved_at) throw new Error("SCOPE_NOT_APPROVED");
  const bp = p.blueprint as Blueprint;
  const org = (await db.query("SELECT name FROM organizations WHERE id = $1", [job.orgId])).rows[0];
  const products = (await db.query("SELECT value FROM answers a JOIN intake_sessions i ON i.id = a.intake_session_id WHERE i.project_id = $1 AND a.question_id = 'core.products_services'", [projectId])).rows[0]?.value ?? "[MISSING: المنتجات والخدمات]";
  let created = 0;
  for (const item of bp.documentPlan) {
    const exists = await db.query("SELECT 1 FROM controlled_documents WHERE code = $1", [item.code]);
    if (exists.rowCount) continue;
    const content = writeDocument(item, { orgName: org.name, products: String(products), bp });
    const d = await db.query(
      `INSERT INTO controlled_documents (org_id, project_id, code, doc_type, title, classification, classification_basis, domain_code, process_code, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [job.orgId, projectId, item.code, item.type, item.title, item.classification, item.basis, item.domainCode, item.processCode ?? null, job.createdBy],
    );
    await db.query(
      `INSERT INTO document_versions (org_id, document_id, version_no, content, content_sha256, change_summary, generated_by, author_id)
       VALUES ($1,$2,1,$3,$4,$5,$6,$7)`,
      [job.orgId, d.rows[0].id, JSON.stringify(content), hashContent(content), "إصدار أولي مولّد من مخطط النظام المعتمد", WRITER_ID, job.createdBy],
    );
    await db.query(
      `INSERT INTO model_runs (org_id, task_type, provider, model, prompt_version, status) VALUES ($1,'document.write','rules','writer',$2,'SUCCEEDED')`,
      [job.orgId, WRITER_ID],
    );
    created++;
  }
  await db.query(
    `INSERT INTO tenant_audit_logs (org_id, actor_id, action, entity_type, entity_id, data) VALUES ($1,$2,'documents.generated','project',$3,$4)`,
    [job.orgId, job.createdBy, projectId, JSON.stringify({ created, total: bp.documentPlan.length })],
  );
  return { created, total: bp.documentPlan.length };
});

// ───────────── Queries ─────────────

export async function listDocuments(ctx: TenantCtx, projectId?: string) {
  return tx(ctx, "read", async (db) => {
    const { rows } = await db.query(
      `SELECT d.*, v.version_no AS latest_version, v.status AS latest_status, v.id AS latest_version_id,
              (SELECT max(version_no) FROM document_versions e WHERE e.document_id = d.id AND e.status = 'EFFECTIVE') AS effective_version
       FROM controlled_documents d
       JOIN LATERAL (SELECT * FROM document_versions x WHERE x.document_id = d.id ORDER BY version_no DESC LIMIT 1) v ON true
       WHERE ($1::uuid IS NULL OR d.project_id = $1) ORDER BY d.code`,
      [projectId ?? null],
    );
    return rows;
  });
}

export async function getDocument(ctx: TenantCtx, documentId: string) {
  return tx(ctx, "read", async (db) => {
    const d = (await db.query("SELECT * FROM controlled_documents WHERE id = $1", [documentId])).rows[0];
    if (!d) throw new DomainError("NOT_FOUND", "الوثيقة غير موجودة");
    const versions = (
      await db.query(
        `SELECT v.*, a.full_name AS author_name, ap.full_name AS approver_name FROM document_versions v
         JOIN users a ON a.id = v.author_id LEFT JOIN users ap ON ap.id = v.approved_by
         WHERE v.document_id = $1 ORDER BY v.version_no DESC`,
        [documentId],
      )
    ).rows;
    const approvals = (
      await db.query(
        `SELECT ap.*, u.full_name AS actor_name, v.version_no FROM approvals ap JOIN users u ON u.id = ap.actor_id
         JOIN document_versions v ON v.id = ap.document_version_id WHERE v.document_id = $1 ORDER BY ap.at`,
        [documentId],
      )
    ).rows;
    const org = (await db.query("SELECT name, logo_url FROM organizations WHERE id = $1", [ctx.orgId])).rows[0];
    return { document: d, versions, approvals, org };
  });
}

async function loadVersion(db: Db, versionId: string) {
  const v = (await db.query("SELECT * FROM document_versions WHERE id = $1 FOR UPDATE", [versionId])).rows[0];
  if (!v) throw new DomainError("NOT_FOUND", "الإصدار غير موجود");
  return v;
}

// ───────────── Lifecycle ─────────────

export async function saveDraft(ctx: TenantCtx, versionId: string, content: DocContent, changeSummary: string) {
  validateContent(content);
  await tx(ctx, "document.edit", async (db) => {
    const v = await loadVersion(db, versionId);
    if (v.status !== "DRAFT") throw new DomainError("ILLEGAL_TRANSITION", "لا يمكن تعديل إصدار غير مسودة؛ أنشئ إصداراً جديداً");
    await db.query(
      `UPDATE document_versions SET content = $1, content_sha256 = $2, change_summary = $3, generated_by = CASE WHEN content_sha256 = $2 THEN generated_by ELSE 'human' END WHERE id = $4`,
      [JSON.stringify(content), hashContent(content), changeSummary.trim() || v.change_summary, versionId],
    );
    await audit(db, ctx, "document.draft_saved", "document_version", versionId, { sha256: hashContent(content) });
  });
}

export async function submitForReview(ctx: TenantCtx, versionId: string) {
  await tx(ctx, "document.submit", async (db) => {
    const v = await loadVersion(db, versionId);
    if (v.status !== "DRAFT") throw new DomainError("ILLEGAL_TRANSITION", "يمكن إرسال المسودات فقط للمراجعة");
    await db.query("UPDATE document_versions SET status = 'IN_REVIEW', submitted_at = now() WHERE id = $1", [versionId]);
    await db.query("UPDATE controlled_documents SET status = CASE WHEN status = 'EFFECTIVE' THEN status ELSE 'IN_REVIEW' END WHERE id = $1", [v.document_id]);
    await db.query("INSERT INTO approvals (org_id, document_version_id, actor_id, decision) VALUES ($1,$2,$3,'SUBMITTED')", [ctx.orgId, versionId, ctx.userId]);
    await audit(db, ctx, "document.submitted", "document_version", versionId);
  });
}

export async function approveVersion(ctx: TenantCtx, versionId: string, comment = "") {
  await tx(ctx, "document.approve", async (db) => {
    const v = await loadVersion(db, versionId);
    if (v.status !== "IN_REVIEW") throw new DomainError("ILLEGAL_TRANSITION", "يمكن اعتماد الإصدارات قيد المراجعة فقط");
    if (v.author_id === ctx.userId) throw new DomainError("SEGREGATION_OF_DUTIES", "لا يجوز لمُعدّ الإصدار اعتماده؛ يلزم مراجع آخر");
    const missing = findPlaceholders(v.content);
    if (missing.length) throw new DomainError("GATE_BLOCKED", "لا يمكن اعتماد وثيقة تحتوي بيانات ناقصة [MISSING]", missing);
    await db.query("UPDATE document_versions SET status = 'APPROVED', approved_by = $1, approved_at = now() WHERE id = $2", [ctx.userId, versionId]);
    await db.query("UPDATE controlled_documents SET status = CASE WHEN status = 'EFFECTIVE' THEN status ELSE 'APPROVED' END WHERE id = $1", [v.document_id]);
    await db.query("INSERT INTO approvals (org_id, document_version_id, actor_id, decision, comment) VALUES ($1,$2,$3,'APPROVED',$4)", [ctx.orgId, versionId, ctx.userId, comment || null]);
    await audit(db, ctx, "document.approved", "document_version", versionId, { sha256: v.content_sha256 });
  });
}

export async function rejectVersion(ctx: TenantCtx, versionId: string, comment: string) {
  if (!comment.trim()) throw new DomainError("VALIDATION", "اذكر سبب الرفض");
  await tx(ctx, "document.approve", async (db) => {
    const v = await loadVersion(db, versionId);
    if (v.status !== "IN_REVIEW") throw new DomainError("ILLEGAL_TRANSITION", "يمكن رفض الإصدارات قيد المراجعة فقط");
    await db.query("UPDATE document_versions SET status = 'REJECTED' WHERE id = $1", [versionId]);
    await db.query("INSERT INTO approvals (org_id, document_version_id, actor_id, decision, comment) VALUES ($1,$2,$3,'REJECTED',$4)", [ctx.orgId, versionId, ctx.userId, comment]);
    await db.query(
      "UPDATE controlled_documents d SET status = CASE WHEN EXISTS (SELECT 1 FROM document_versions WHERE document_id = d.id AND status='EFFECTIVE') THEN 'EFFECTIVE' ELSE 'DRAFT' END WHERE id = $1",
      [v.document_id],
    );
    await audit(db, ctx, "document.rejected", "document_version", versionId, { comment });
  });
}

export async function makeEffective(ctx: TenantCtx, versionId: string) {
  await tx(ctx, "document.make_effective", async (db) => {
    const v = await loadVersion(db, versionId);
    if (v.status !== "APPROVED") throw new DomainError("ILLEGAL_TRANSITION", "يجب اعتماد الإصدار قبل جعله سارياً");
    await db.query(
      "UPDATE document_versions SET status = 'SUPERSEDED', superseded_at = now() WHERE document_id = $1 AND status = 'EFFECTIVE'",
      [v.document_id],
    );
    await db.query("UPDATE document_versions SET status = 'EFFECTIVE', effective_at = now() WHERE id = $1", [versionId]);
    await db.query("UPDATE controlled_documents SET status = 'EFFECTIVE' WHERE id = $1", [v.document_id]);
    await db.query("INSERT INTO approvals (org_id, document_version_id, actor_id, decision) VALUES ($1,$2,$3,'MADE_EFFECTIVE')", [ctx.orgId, versionId, ctx.userId]);
    await audit(db, ctx, "document.effective", "document_version", versionId, { version: v.version_no });
  });
}

/** Never edits an effective version in place: creates a new DRAFT from the latest version. */
export async function newRevision(ctx: TenantCtx, documentId: string, changeSummary: string): Promise<string> {
  if (!changeSummary.trim()) throw new DomainError("VALIDATION", "اذكر سبب التعديل");
  return tx(ctx, "document.edit", async (db) => {
    const open = await db.query("SELECT 1 FROM document_versions WHERE document_id = $1 AND status IN ('DRAFT','IN_REVIEW','APPROVED')", [documentId]);
    if (open.rowCount) throw new DomainError("CONFLICT", "يوجد إصدار مفتوح لهذه الوثيقة؛ أكمله أولاً");
    const last = (await db.query("SELECT * FROM document_versions WHERE document_id = $1 ORDER BY version_no DESC LIMIT 1", [documentId])).rows[0];
    if (!last) throw new DomainError("NOT_FOUND", "الوثيقة غير موجودة");
    const { rows } = await db.query(
      `INSERT INTO document_versions (org_id, document_id, version_no, content, content_sha256, change_summary, generated_by, author_id)
       VALUES ($1,$2,$3,$4,$5,$6,'human',$7) RETURNING id`,
      [ctx.orgId, documentId, last.version_no + 1, JSON.stringify(last.content), last.content_sha256, changeSummary.trim(), ctx.userId],
    );
    await audit(db, ctx, "document.revision_started", "document", documentId, { version: last.version_no + 1 });
    return rows[0].id;
  });
}

// ───────────── Content <-> editable text ─────────────

function validateContent(c: DocContent) {
  if (!c || !Array.isArray(c.sections) || c.sections.length === 0) throw new DomainError("VALIDATION", "المحتوى فارغ");
  if (c.sections.length > 200) throw new DomainError("VALIDATION", "عدد الأقسام كبير جداً");
  if (JSON.stringify(c).length > 500_000) throw new DomainError("VALIDATION", "المحتوى كبير جداً");
}

/** Editable plain-text format: "## heading", paragraphs, and "| a | b |" table rows (first row = headers). */
export function contentToText(c: DocContent): string {
  return c.sections
    .map((s) => {
      const lines = [`## ${s.heading}`, ...s.paragraphs];
      if (s.table) lines.push(...[s.table.headers, ...s.table.rows].map((r) => `| ${r.join(" | ")} |`));
      return lines.join("\n");
    })
    .join("\n\n");
}

export function textToContent(text: string): DocContent {
  const sections: DocSection[] = [];
  let cur: DocSection | null = null;
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      cur = { heading: line.slice(3).trim(), paragraphs: [] };
      sections.push(cur);
      continue;
    }
    if (!line) continue;
    if (!cur) {
      cur = { heading: "مقدمة", paragraphs: [] };
      sections.push(cur);
    }
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.slice(1, -1).split("|").map((x) => x.trim());
      if (!cur.table) cur.table = { headers: cells, rows: [] };
      else cur.table.rows.push(cells);
    } else {
      cur.paragraphs.push(line);
    }
  }
  return { sections };
}

/** Line-level diff (LCS) between two versions' editable text. */
export function diffLines(a: string, b: string): { op: "=" | "-" | "+"; line: string }[] {
  const x = a.split("\n");
  const y = b.split("\n");
  const n = x.length;
  const m = y.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { op: "=" | "-" | "+"; line: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ op: "=", line: x[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: "-", line: x[i++] });
    else out.push({ op: "+", line: y[j++] });
  }
  while (i < n) out.push({ op: "-", line: x[i++] });
  while (j < m) out.push({ op: "+", line: y[j++] });
  return out;
}

// ───────────── AI-assisted wording (optional, gated) ─────────────

export const REWRITE_PROMPT_VERSION = "rewrite-section@1";

/** Suggests clearer Arabic wording for one draft section. Never saves; the human decides. */
export async function suggestSectionRewrite(ctx: TenantCtx, versionId: string, sectionIndex: number): Promise<string> {
  const { runAiTask, validateRewrite } = await import("../ai/gateway");
  return tx(ctx, "document.edit", async (db) => {
    const v = await loadVersion(db, versionId);
    if (v.status !== "DRAFT") throw new DomainError("ILLEGAL_TRANSITION", "الاقتراحات متاحة للمسودات فقط");
    const s = (v.content as DocContent).sections[sectionIndex];
    if (!s) throw new DomainError("NOT_FOUND", "القسم غير موجود");
    const source = [s.heading, ...s.paragraphs].join("\n");
    const out = await runAiTask(db, ctx, {
      taskType: "document.rewrite_section",
      promptVersion: REWRITE_PROMPT_VERSION,
      system:
        "You are an editor of Arabic management-system documents. Improve clarity and formal Arabic style only. " +
        "Do not add facts, numbers, dates, names, signatures, approvals or claims of certification. Keep every [MISSING: ...] marker verbatim. " +
        "Do not quote or paraphrase ISO standard text. Return only the rewritten paragraphs, one per line, without the heading.",
      instruction: "Rewrite the paragraphs of this document section.",
      untrustedData: source,
      maxTokens: 4000,
      validate: (t) => validateRewrite(source, t),
    });
    await audit(db, ctx, "ai.suggestion_generated", "document_version", versionId, { sectionIndex, promptVersion: REWRITE_PROMPT_VERSION });
    return out;
  });
}

// ───────────── Rendering input (shared by DOCX / PDF / ZIP) ─────────────

const isoDay = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export interface Renderable {
  content: DocContent;
  meta: import("../docs/labels").RenderMeta;
  fileBase: string;
}

/** Loads a version and its document under tenant RLS. Throws NOT_FOUND for foreign/unknown ids. */
export async function loadRenderable(ctx: TenantCtx, versionId: string): Promise<Renderable> {
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) throw new DomainError("NOT_FOUND", "الإصدار غير موجود");
  const docId = await tx(ctx, "read", async (db) => (await db.query("SELECT document_id FROM document_versions WHERE id = $1", [versionId])).rows[0]?.document_id);
  if (!docId) throw new DomainError("NOT_FOUND", "الإصدار غير موجود");
  const { document: d, versions, org } = await getDocument(ctx, docId);
  return renderableFrom(d, versions, org, versionId);
}

function renderableFrom(
  d: { code: string; title: string; classification: string },
  versions: { id: string; version_no: number; status: string; change_summary: string; created_at: Date; content: DocContent; author_name: string; approver_name: string | null; approved_at: Date | null; effective_at: Date | null }[],
  org: { name: string },
  versionId: string,
): Renderable {
  const v = versions.find((x) => x.id === versionId)!;
  return {
    content: v.content,
    fileBase: `${d.code}-v${v.version_no}`,
    meta: {
      orgName: org.name,
      code: d.code,
      title: d.title,
      versionNo: v.version_no,
      status: v.status,
      classification: d.classification,
      author: v.author_name,
      approver: v.approver_name,
      approvedAt: isoDay(v.approved_at),
      effectiveAt: isoDay(v.effective_at),
      history: [...versions]
        .reverse()
        .filter((x) => x.version_no <= v.version_no)
        .map((x) => ({ versionNo: x.version_no, status: x.status, summary: x.change_summary, date: isoDay(x.created_at)! })),
    },
  };
}

/** For packaging: the effective version if one exists, otherwise the latest version. */
export async function packagingSet(ctx: TenantCtx, projectId: string) {
  const docs = await listDocuments(ctx, projectId);
  const out: (Renderable & { documentId: string; docType: string; classification: string; basis: string; isEffective: boolean; latestStatus: string })[] = [];
  for (const d of docs) {
    const { document, versions, org } = await getDocument(ctx, d.id);
    const chosen = versions.find((v) => v.status === "EFFECTIVE") ?? versions[0];
    out.push({
      ...renderableFrom(document, versions, org, chosen.id),
      documentId: d.id,
      docType: d.doc_type,
      classification: d.classification,
      basis: d.classification_basis,
      isEffective: chosen.status === "EFFECTIVE",
      latestStatus: versions[0].status,
    });
  }
  return out;
}
