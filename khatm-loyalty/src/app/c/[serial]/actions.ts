"use server";

import { redirect } from "next/navigation";
import { deleteSelf } from "@/server/domain/customers";

export async function deleteMyDataAction(fd: FormData) {
  await deleteSelf(String(fd.get("serial")), String(fd.get("k")));
  redirect("/c/deleted");
}
