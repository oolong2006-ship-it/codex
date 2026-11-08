"use server";

import { revalidatePath } from "next/cache";
import { createStaff, setStaffActive } from "@/server/domain/management";
import { requireDashboardActor, errorMessage, str, type ActionState } from "@/server/web";

export async function createStaffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await createStaff(await requireDashboardActor(), {
      name: str(fd, "name"),
      role: str(fd, "role") as "CASHIER",
      branchId: str(fd, "branchId"),
      email: str(fd, "email"),
      password: str(fd, "password"),
      pin: str(fd, "pin"),
    });
    revalidatePath("/dashboard/staff");
    return {};
  } catch (e) {
    return { error: await errorMessage(e) };
  }
}

export async function toggleStaffAction(fd: FormData) {
  await setStaffActive(await requireDashboardActor(), str(fd, "id"), str(fd, "active") === "1");
  revalidatePath("/dashboard/staff");
}
