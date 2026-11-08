import { appleWebService } from "@/server/wallet/apple-service";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const body = req.method === "GET" || req.method === "DELETE" ? "" : (await req.text()).slice(0, 64_000);
  return appleWebService(req.method, path, req.headers, body, new URL(req.url).searchParams);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
