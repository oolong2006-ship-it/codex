import { one } from "@/server/db";
import { parseDesign } from "@/server/domain/design";
import { tilePng } from "@/server/wallet/png";

/** Public program logo (Google Wallet requires an https image URL). */
export async function GET(_: Request, { params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(merchantId)) return new Response("Not found", { status: 404 });
  const p = await one<{ design: unknown }>(`SELECT design FROM loyalty_programs WHERE merchant_id = $1 ORDER BY created_at LIMIT 1`, [merchantId]);
  if (!p) return new Response("Not found", { status: 404 });
  const d = parseDesign(p.design);
  return new Response(new Uint8Array(tilePng(660, d.bg, d.accent)), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
}
