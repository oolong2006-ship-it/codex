import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isProcurement } from "@/lib/rbac";
import { readStoredFile } from "@/lib/storage";

/** Authenticated, tenant-scoped document download. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const doc = await prisma.document.findFirst({
    where: { id: params.id, supplier: { organizationId: user.organizationId } },
    include: { supplier: { select: { ownerUserId: true } } },
  });
  if (!doc) return new NextResponse("Not found", { status: 404 });

  // Suppliers may only fetch their own documents; procurement roles may fetch any within the tenant.
  const allowed = isProcurement(user.role) || doc.supplier.ownerUserId === user.id;
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  try {
    const buf = await readStoredFile(doc.filePath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("File unavailable", { status: 410 });
  }
}
