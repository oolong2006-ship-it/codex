import { handlePosWebhook } from "@/server/integrations/pos";
import { AppError } from "@/server/errors";

/** POS webhooks. Signature: hex HMAC-SHA256 of the raw body in X-Khatm-Signature (or X-Signature). */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string; id: string }> }) {
  const { id } = await params;
  const raw = (await req.text()).slice(0, 256_000);
  try {
    const result = await handlePosWebhook(id, raw, req.headers.get("x-khatm-signature") ?? req.headers.get("x-signature"));
    return Response.json({ result });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.code }, { status: e.status });
    console.error(e);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
