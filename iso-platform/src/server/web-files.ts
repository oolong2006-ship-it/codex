import "server-only";
import { NextResponse } from "next/server";
import { resolveCtx, type TenantCtx } from "./domain/tenant";
import { isDomainError } from "./errors";
import { currentSession } from "./web";

/** Auth + tenant resolution for file routes; maps domain errors to HTTP without leaking details. */
export async function fileRoute(fn: (ctx: TenantCtx) => Promise<NextResponse>): Promise<NextResponse> {
  const s = await currentSession();
  if (!s?.activeOrgId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const ctx = await resolveCtx(s.userId, s.activeOrgId).catch(() => null);
  if (!ctx) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    return await fn(ctx);
  } catch (e) {
    const notFound =
      (isDomainError(e) && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) ||
      (e && typeof e === "object" && (e as { code?: string }).code === "22P02"); // malformed uuid
    if (notFound) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (isDomainError(e)) return NextResponse.json({ error: e.code, message: e.message }, { status: 409 });
    console.error(e);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}

export function fileResponse(buf: Buffer, filename: string, type: string) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  zip: "application/zip",
};
