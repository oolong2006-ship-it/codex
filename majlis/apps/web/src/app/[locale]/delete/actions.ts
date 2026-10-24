"use server";

import { eraseByDeletionCode } from "@majlis/db";
import { z } from "zod";
import { db, recordings } from "@/lib/server";

const Code = z.string().trim().min(12).max(20);

// No store configured means nothing was ever recorded.
const nothingRecorded = { delete: async () => {} };

/** The participant's right to deletion; codes are random 60-bit values, never guessable. */
export async function eraseParticipationAction(code: string): Promise<"done" | "not_found"> {
  const parsed = Code.safeParse(code);
  if (!parsed.success) return "not_found";
  const erased = await eraseByDeletionCode(db(), recordings() ?? nothingRecorded, parsed.data);
  return erased ? "done" : "not_found";
}
