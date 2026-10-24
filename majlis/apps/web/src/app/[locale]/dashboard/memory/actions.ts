"use server";

import { answerFromMemory, parseQuestion, type MemoryAnswer } from "@majlis/analysis";
import { searchMemory } from "@majlis/db";
import { createProviders } from "@majlis/providers";
import { z } from "zod";
import { db, guideLlm, requireUser } from "@/lib/server";

const Question = z.string().trim().min(3).max(300);

/** Answers strictly from the organization's own interviews. */
export async function askMemoryAction(
  locale: string,
  question: string,
): Promise<MemoryAnswer | null> {
  const user = await requireUser(locale);
  const parsed = Question.safeParse(question);
  if (!parsed.success) return null;
  const query = parseQuestion(parsed.data);
  const [vector] = await createProviders().embedding.embed([query.topicQuery], "query");
  const hits = await searchMemory(db(), user.orgId, vector!, query.filters, {
    limit: 8,
    minSimilarity: Number(process.env.MEMORY_MIN_SIMILARITY ?? 0.1),
  });
  const llm = guideLlm();
  return answerFromMemory(parsed.data, query, hits, llm ? { llm } : {});
}
