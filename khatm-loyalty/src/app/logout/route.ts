import { cookies } from "next/headers";
import { destroySession } from "@/server/domain/accounts";
import { DASH_COOKIE, POS_COOKIE } from "@/server/web";

export async function POST(req: Request) {
  const jar = await cookies();
  const which = new URL(req.url).searchParams.get("from") === "pos" ? POS_COOKIE : DASH_COOKIE;
  await destroySession(jar.get(which)?.value);
  jar.delete(which);
  return Response.redirect(new URL(which === POS_COOKIE ? "/pos/login" : "/login", req.url), 303);
}
