import { buildDeliveryPackage } from "@/server/docs/package";
import { MIME, fileResponse, fileRoute } from "@/server/web-files";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const includePdf = new URL(req.url).searchParams.get("pdf") !== "0";
  return fileRoute(async (ctx) => {
    const pkg = await buildDeliveryPackage(ctx, projectId, { includePdf });
    return fileResponse(pkg.buffer, pkg.fileName, MIME.zip);
  });
}
