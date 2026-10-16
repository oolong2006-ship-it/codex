import { loadRenderable } from "@/server/domain/documents";
import { renderDocx } from "@/server/docs/docx";
import { MIME, fileResponse, fileRoute } from "@/server/web-files";

export async function GET(_req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  return fileRoute(async (ctx) => {
    const r = await loadRenderable(ctx, versionId);
    return fileResponse(await renderDocx(r.content, r.meta), `${r.fileBase}.docx`, MIME.docx);
  });
}
