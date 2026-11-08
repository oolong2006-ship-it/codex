"use server";

import { revalidatePath } from "next/cache";
import { updateProgram } from "@/server/domain/management";
import { requireDashboardActor, errorMessage, getLang, str, type ActionState } from "@/server/web";
import { t } from "@/lib/i18n";

export async function saveProgramAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const actor = await requireDashboardActor();
    await updateProgram(actor, {
      name: str(fd, "name"),
      stampsRequired: Number(str(fd, "stampsRequired")),
      rewardDescription: str(fd, "rewardDescription"),
      cooldownMinutes: Number(str(fd, "cooldownMinutes")),
      maxStampsPerScan: Number(str(fd, "maxStampsPerScan")),
      welcomeStamps: Number(str(fd, "welcomeStamps")),
      terms: str(fd, "terms"),
      active: fd.get("active") === "on",
      design: { bg: str(fd, "bg"), fg: str(fd, "fg"), accent: str(fd, "accent"), icon: str(fd, "icon") as never },
    });
    revalidatePath("/dashboard", "layout");
    return { ok: t(await getLang(), "common.saved") };
  } catch (e) {
    return { error: await errorMessage(e) };
  }
}
