import { NextResponse } from "next/server";
import { getAppPool } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness + database reachability. Reveals no data. */
export async function GET() {
  try {
    await getAppPool().query("SELECT 1");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
