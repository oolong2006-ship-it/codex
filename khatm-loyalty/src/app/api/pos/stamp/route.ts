import { z } from "zod";
import { addStamps } from "@/server/domain/stamping";
import { apiError, getPosActor } from "@/server/web";

const body = z.object({ serial: z.string().regex(/^[A-Z0-9]{8,40}$/), quantity: z.number().int().min(1).max(10) });

export async function POST(req: Request) {
  const actor = await getPosActor();
  if (!actor) return Response.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const { serial, quantity } = body.parse(await req.json());
    return Response.json(await addStamps(actor, serial, quantity, { source: "STAFF", device: req.headers.get("user-agent") }));
  } catch (e) {
    return apiError(e);
  }
}
