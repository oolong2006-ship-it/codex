import { getNc, ncReportContent } from "@/server/domain/capa";
import { renderDocx } from "@/server/docs/docx";
import { renderPdf } from "@/server/docs/pdf";
import { MIME, fileResponse, fileRoute } from "@/server/web-files";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "docx";
  return fileRoute(async (ctx) => {
    const r = await getNc(ctx, id);
    const today = new Date().toISOString().slice(0, 10);
    const meta = {
      orgName: r.orgName,
      code: r.nc.code,
      title: `تقرير عدم مطابقة وإجراء تصحيحي — ${r.nc.title}`,
      versionNo: 1,
      status: r.nc.status === "CLOSED" ? "EFFECTIVE" : "DRAFT",
      classification: "SUGGESTED",
      author: r.nc.reporter_name,
      approver: r.nc.closer_name ?? null,
      approvedAt: r.nc.closed_at ? new Date(r.nc.closed_at).toISOString().slice(0, 10) : null,
      effectiveAt: null,
      history: [{ versionNo: 1, status: r.nc.status === "CLOSED" ? "EFFECTIVE" : "DRAFT", summary: "تقرير مولّد من سجل الحالة في المنصة", date: today }],
    };
    const content = ncReportContent(r);
    const buf = format === "pdf" ? await renderPdf(content, meta) : await renderDocx(content, meta);
    return fileResponse(buf, `${r.nc.code}.${format}`, MIME[format]);
  });
}
