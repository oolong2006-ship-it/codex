"use server";

import { correctTranscript, dismissFlag, rateInterviewerTurn } from "@majlis/db";
import { z } from "zod";
import { canReview, db, requireUser } from "@/lib/server";

const Id = z.string().uuid();

// No revalidation: a saved card stays in place showing "saved"; the lists and
// metrics refresh on the next visit.

async function reviewer(locale: string) {
  const user = await requireUser(locale);
  return canReview(user) ? user : null;
}

export async function correctTranscriptAction(locale: string, turnId: string, text: string) {
  const user = await reviewer(locale);
  const parsed = z.object({ turnId: Id, text: z.string().trim().min(1).max(4000) });
  const input = parsed.safeParse({ turnId, text });
  if (!user || !input.success) return false;
  return correctTranscript(db(), user.orgId, { ...input.data, reviewerId: user.id });
}

export async function dismissFlagAction(locale: string, flagId: string) {
  const user = await reviewer(locale);
  if (!user || !Id.safeParse(flagId).success) return false;
  return dismissFlag(db(), user.orgId, flagId, user.id);
}

export async function rateInterviewerAction(
  locale: string,
  turnId: string,
  naturalness: number,
  dialectCorrect: boolean,
) {
  const user = await reviewer(locale);
  if (!user || !Id.safeParse(turnId).success) return false;
  return rateInterviewerTurn(db(), user.orgId, {
    turnId,
    reviewerId: user.id,
    naturalness,
    dialectCorrect,
  });
}
