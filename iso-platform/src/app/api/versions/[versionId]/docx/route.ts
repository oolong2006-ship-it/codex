import { NextResponse } from "next/server";
import { withTenant } from "@/server/db";
import { getDocument } from "@/server/domain/documents";
import { resolveCtx } from "@/server/domain/tenant";
import { renderDocx } from "@/server/docs/docx";
import { currentSession } from "@/server/web";

const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export async function GET(_req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const s = await currentSession();
  if (!s?.activeOrgId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const ctx = await resolveCtx(s.userId, s.activeOrgId).catch(() => null);
  if (!ctx) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const docId = await withTenant(ctx.orgId, ctx.userId, async (db) => (await db.query("SELECT document_id FROM document_versions WHERE id = $1", [versionId])).rows[0]?.document_id);
  if (!docId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const { document: d, versions, org } = await getDocument(ctx, docId);
  const v = versions.find((x) => x.id === versionId)!;
  const buf = await renderDocx(v.content, {
    orgName: org.name,
    code: d.code,
    title: d.title,
    versionNo: v.version_no,
    status: v.status,
    classification: d.classification,
    author: v.author_name,
    approver: v.approver_name,
    approvedAt: day(v.approved_at),
    effectiveAt: day(v.effective_at),
    history: [...versions].reverse().filter((x) => x.version_no <= v.version_no).map((x) => ({ versionNo: x.version_no, status: x.status, summary: x.change_summary, date: day(x.created_at)! })),
  });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${d.code}-v${v.version_no}.docx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
