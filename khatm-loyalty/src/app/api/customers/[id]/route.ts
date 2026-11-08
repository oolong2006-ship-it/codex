import { exportCustomer } from "@/server/domain/customers";
import { apiError, getDashboardActor } from "@/server/web";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getDashboardActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  try {
    const data = await exportCustomer(actor, id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="customer-${id}.json"`, "cache-control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
