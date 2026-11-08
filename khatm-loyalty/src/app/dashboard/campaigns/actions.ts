"use server";

import { revalidatePath } from "next/cache";
import { sendCampaign } from "@/server/domain/campaigns";
import { requireDashboardActor, errorMessage, getLang, str, type ActionState } from "@/server/web";
import { t } from "@/lib/i18n";

export async function sendCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const n = await sendCampaign(await requireDashboardActor(), {
      templateKey: str(fd, "templateKey"),
      audience: str(fd, "audience") as "ALL",
      message: str(fd, "message"),
    });
    revalidatePath("/dashboard/campaigns");
    return { ok: t(await getLang(), "campaigns.sent", { n }) };
  } catch (e) {
    return { error: await errorMessage(e) };
  }
}
