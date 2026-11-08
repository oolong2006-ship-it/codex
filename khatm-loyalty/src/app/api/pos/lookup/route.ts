import { lookupCard, lookupSchema } from "@/server/domain/stamping";
import { apiError, getPosActor, getDashboardActor } from "@/server/web";

export async function POST(req: Request) {
  const actor = (await getPosActor()) ?? (await getDashboardActor());
  if (!actor) return Response.json({ error: "unauthenticated" }, { status: 401 });
  try {
    return Response.json(await lookupCard(actor, lookupSchema.parse(await req.json())));
  } catch (e) {
    return apiError(e);
  }
}
