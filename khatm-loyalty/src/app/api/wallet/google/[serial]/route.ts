import { passViewBySerial } from "@/server/wallet/pass-view";
import { wallet } from "@/server/wallet";
import { safeEqual } from "@/server/domain/customers";

export async function GET(req: Request, { params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const k = new URL(req.url).searchParams.get("k") ?? "";
  const view = await passViewBySerial(serial);
  if (!view || !safeEqual(view.authToken, k)) return new Response("Not found", { status: 404 });
  const w = wallet();
  if (!w.googleAvailable()) return new Response("Google Wallet not configured", { status: 503 });
  return Response.redirect(await w.googleSaveUrl(view), 302);
}
