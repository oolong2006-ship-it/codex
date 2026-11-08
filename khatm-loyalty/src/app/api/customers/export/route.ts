import { customersCsv } from "@/server/domain/customers";
import { apiError, getDashboardActor } from "@/server/web";

export async function GET() {
  const actor = await getDashboardActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  try {
    const csv = await customersCsv(actor);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
