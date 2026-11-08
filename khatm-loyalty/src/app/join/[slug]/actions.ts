"use server";

import { redirect } from "next/navigation";
import { enroll } from "@/server/domain/enrollment";
import { clientIp, errorMessage, getLang, str, type ActionState } from "@/server/web";
import { t } from "@/lib/i18n";

export async function joinAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let target: string;
  try {
    const r = await enroll(
      {
        programSlug: str(fd, "slug"),
        name: str(fd, "name"),
        phone: str(fd, "phone"),
        consent: (fd.get("consent") === "on") as true,
        marketingOptIn: fd.get("marketing") === "on",
      },
      await clientIp(),
    );
    if (r.kind === "existing_sent") return { ok: t(await getLang(), "join.existing") };
    target = `/c/${r.serial}?k=${encodeURIComponent(r.authToken)}&new=1`;
  } catch (e) {
    return { error: await errorMessage(e) };
  }
  redirect(target);
}
