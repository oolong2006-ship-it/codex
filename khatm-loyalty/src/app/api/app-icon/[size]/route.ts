import { tilePng } from "@/server/wallet/png";

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = (await params).size === "512" ? 512 : 192;
  return new Response(new Uint8Array(tilePng(size, "#3B2418", "#F59E0B")), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
}
