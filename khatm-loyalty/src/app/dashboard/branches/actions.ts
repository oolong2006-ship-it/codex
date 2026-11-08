"use server";

import { revalidatePath } from "next/cache";
import { createBranch, setBranchActive } from "@/server/domain/management";
import { requireDashboardActor, errorMessage, str, type ActionState } from "@/server/web";

export async function createBranchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await createBranch(await requireDashboardActor(), { name: str(fd, "name"), city: str(fd, "city") });
    revalidatePath("/dashboard/branches");
    return {};
  } catch (e) {
    return { error: await errorMessage(e) };
  }
}

export async function toggleBranchAction(fd: FormData) {
  await setBranchActive(await requireDashboardActor(), str(fd, "id"), str(fd, "active") === "1");
  revalidatePath("/dashboard/branches");
}
