import { z } from "zod";
import { redeemReward } from "@/server/domain/stamping";
import { apiError, getPosActor } from "@/server/web";

const body = z.object({ serial: z.string().regex(/^[A-Z0-9]{8,40}$/) });

export async function POST(req: Request) {
  const actor = await getPosActor();
  if (!actor) return Response.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const { serial } = body.parse(await req.json());
    return Response.json(await redeemReward(actor, serial, req.headers.get("user-agent")));
  } catch (e) {
    return apiError(e);
  }
}
