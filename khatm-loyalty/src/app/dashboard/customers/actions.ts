"use server";

import { revalidatePath } from "next/cache";
import { deleteCustomer } from "@/server/domain/customers";
import { requireDashboardActor } from "@/server/web";

export async function deleteCustomerAction(fd: FormData) {
  const actor = await requireDashboardActor();
  await deleteCustomer(actor, String(fd.get("id")));
  revalidatePath("/dashboard/customers");
}
