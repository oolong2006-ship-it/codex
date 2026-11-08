import { passViewBySerial } from "@/server/wallet/pass-view";
import { wallet } from "@/server/wallet";
import { safeEqual } from "@/server/domain/customers";

/** Download the .pkpass from the web card ("Add to Apple Wallet"). */
export async function GET(req: Request, { params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const k = new URL(req.url).searchParams.get("k") ?? "";
  const view = await passViewBySerial(serial);
  if (!view || !safeEqual(view.authToken, k)) return new Response("Not found", { status: 404 });
  const w = wallet();
  if (!w.appleAvailable()) return new Response("Apple Wallet not configured", { status: 503 });
  const buf = await w.buildApplePass(view);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.apple.pkpass",
      "content-disposition": `attachment; filename="${view.merchantSlug}.pkpass"`,
      "last-modified": view.updatedAt.toUTCString(),
      "cache-control": "no-store",
    },
  });
}
