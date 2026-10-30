import { loadRenderable } from "@/server/domain/documents";
import { renderPdf } from "@/server/docs/pdf";
import { MIME, fileResponse, fileRoute } from "@/server/web-files";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  return fileRoute(async (ctx) => {
    const r = await loadRenderable(ctx, versionId);
    return fileResponse(await renderPdf(r.content, r.meta), `${r.fileBase}.pdf`, MIME.pdf);
  });
}
