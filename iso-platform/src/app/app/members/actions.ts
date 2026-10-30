"use server";
import { revalidatePath } from "next/cache";
import { addMember } from "@/server/domain/orgs";
import type { Role } from "@/server/rbac";
import { errorMessage, requireCtx, str } from "@/server/web";

export type AddMemberState = { error?: string; email?: string; tempPassword?: string | null } | null;

/** Returns the one-time password in the action response (never in a URL or log). */
export async function addMemberAction(_prev: AddMemberState, fd: FormData): Promise<AddMemberState> {
  const { ctx } = await requireCtx();
  try {
    const r = await addMember(ctx, { email: str(fd, "email"), fullName: str(fd, "fullName"), role: str(fd, "role") as Role, jobTitle: str(fd, "jobTitle") });
    revalidatePath("/app/members");
    return { email: str(fd, "email"), tempPassword: r.tempPassword };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
