import { getDashboardActor } from "@/server/web";
import { getProgram } from "@/server/domain/management";
import { env } from "@/server/env";
import { qrPng } from "@/server/qr";

export async function GET() {
  const actor = await getDashboardActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const program = await getProgram(actor);
  const png = await qrPng(`${env().APP_URL}/join/${program.slug}`);
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "content-disposition": `attachment; filename="join-${program.slug}.png"` },
  });
}
