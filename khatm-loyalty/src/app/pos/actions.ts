"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, loginWithPin, setSessionBranch } from "@/server/domain/accounts";
import { listBranches } from "@/server/domain/management";
import { pool } from "@/server/db";
import { AppError } from "@/server/errors";
import { clientIp, errorMessage, getDashboardActor, getPosActor, POS_COOKIE, setSessionCookie, str, type ActionState } from "@/server/web";

export async function pinLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let needsBranch = false;
  try {
    const r = await loginWithPin(str(fd, "merchant"), str(fd, "pin"), await clientIp());
    await setSessionCookie(POS_COOKIE, r.token, 30);
    needsBranch = r.needsBranch;
  } catch (e) {
    return { error: await errorMessage(e) };
  }
  redirect(needsBranch ? "/pos/branch" : "/pos");
}

/**
 * Binds the cashier device to a branch. A signed-in owner/manager (dashboard
 * session) gets a separate staff session, so the dashboard cookie is never
 * reused for stamping.
 */
export async function chooseBranchAction(fd: FormData) {
  const branchId = str(fd, "branchId");
  const posActor = await getPosActor();
  const posToken = (await cookies()).get(POS_COOKIE)?.value;
  if (posActor && posToken) {
    await setSessionBranch(posToken, posActor, branchId);
    redirect("/pos");
  }
  const dash = await getDashboardActor();
  if (!dash) redirect("/pos/login");
  const branches = await listBranches(dash, true);
  if (!branches.some((b) => b.id === branchId)) throw new AppError("errors.notFound", 404);
  const token = await createSession(pool(), dash.staffUserId, "staff", branchId);
  await setSessionCookie(POS_COOKIE, token, 30);
  redirect("/pos");
}
