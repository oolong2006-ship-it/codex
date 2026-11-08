"use server";

import { redirect } from "next/navigation";
import { loginWithPassword, signup } from "@/server/domain/accounts";
import { AppError } from "@/server/errors";
import { clientIp, DASH_COOKIE, errorMessage, setSessionCookie, str, type ActionState } from "@/server/web";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const token = await loginWithPassword(str(fd, "email"), str(fd, "password"), await clientIp());
    await setSessionCookie(DASH_COOKIE, token, 14);
  } catch (e) {
    return { error: await errorMessage(e) };
  }
  redirect("/dashboard");
}

export async function signupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    if (str(fd, "password").length < 10) return { error: await errorMessage(new AppError("errors.weakPassword")) };
    const { token } = await signup({
      businessName: str(fd, "businessName"),
      slug: str(fd, "slug"),
      ownerName: str(fd, "ownerName"),
      email: str(fd, "email"),
      password: str(fd, "password"),
      branchName: str(fd, "branchName"),
      city: str(fd, "city") || undefined,
    });
    await setSessionCookie(DASH_COOKIE, token, 14);
  } catch (e) {
    return { error: await errorMessage(e) };
  }
  redirect("/dashboard/program?welcome=1");
}
