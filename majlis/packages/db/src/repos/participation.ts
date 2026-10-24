import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { InterviewEngine, loadPhrases, type ScreenerQuestion } from "@majlis/interviewer";
import type { Db } from "../client.js";
import { consentRecords, interviewSessions, participants, studies } from "../schema.js";
import { latestGuide, type GuideContent } from "./studies.js";

/** What the participant page needs: no internal ids beyond the invite token. */
export async function getInvite(db: Db, inviteToken: string) {
  const [study] = await db.select().from(studies).where(eq(studies.inviteToken, inviteToken));
  if (!study) return null;
  const guide = await latestGuide(db, study.id);
  if (!guide) return null;
  return {
    open: study.status === "recruiting",
    topic: study.topic,
    durationPhrase: study.durationPhrase,
    incentive: study.incentive,
    voiceSetting: study.voiceSetting,
    segment: study.segment,
    screener: guide.screener,
    /** The exact disclosure each interviewer voice will speak. */
    disclosure: {
      male: disclosureFor(study, guide.content, "male"),
      female: disclosureFor(study, guide.content, "female"),
    },
  };
}

function disclosureFor(
  study: typeof studies.$inferSelect,
  content: GuideContent,
  voiceGender: "male" | "female",
): string {
  return new InterviewEngine({
    guide: { ...content, studyId: study.id, durationPhrase: study.durationPhrase },
    voiceGender,
  }).disclosureText;
}

export interface StartInput {
  inviteToken: string;
  consent: { interview: boolean; allowAudioPlayback: boolean };
  participant: {
    gender?: "male" | "female";
    city?: string;
    ageBand?: "18-24" | "25-34" | "35-44" | "45-54" | "55+";
    dialect?: string;
  };
  screenerAnswers: Record<string, string>;
  voiceGender: "male" | "female";
}

export type StartResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "not_found" | "closed" | "no_consent" | "screened_out" };

export function qualifies(screener: ScreenerQuestion[], answers: Record<string, string>): boolean {
  return screener.every((q) => q.options.find((o) => o.id === answers[q.id])?.qualifies === true);
}

/**
 * Creates participant, session and consent record in one transaction. The
 * interview cannot start without an explicit consent record, which stores the
 * exact disclosure text the interviewer will speak and its SHA-256.
 */
export async function startInterview(db: Db, input: StartInput): Promise<StartResult> {
  if (!input.consent.interview) return { ok: false, reason: "no_consent" };
  const [study] = await db.select().from(studies).where(eq(studies.inviteToken, input.inviteToken));
  if (!study) return { ok: false, reason: "not_found" };
  if (study.status !== "recruiting") return { ok: false, reason: "closed" };
  const guide = await latestGuide(db, study.id);
  if (!guide) return { ok: false, reason: "not_found" };
  if (!qualifies(guide.screener, input.screenerAnswers))
    return { ok: false, reason: "screened_out" };

  const voiceGender =
    study.voiceSetting === "participant_choice" ? input.voiceGender : study.voiceSetting;
  const guideSnapshot = {
    ...guide.content,
    studyId: study.id,
    durationPhrase: study.durationPhrase,
    ...(study.incentive ? { incentive: study.incentive } : {}),
  };
  const disclosureText = new InterviewEngine({ guide: guideSnapshot, voiceGender }).disclosureText;
  const sessionId = randomBytes(18).toString("base64url");

  await db.transaction(async (tx) => {
    const [participant] = await tx
      .insert(participants)
      .values({
        studyId: study.id,
        gender: input.participant.gender ?? null,
        city: input.participant.city?.slice(0, 60) ?? null,
        ageBand: input.participant.ageBand ?? null,
        dialect: input.participant.dialect ?? null,
      })
      .returning({ id: participants.id });
    await tx.insert(interviewSessions).values({
      id: sessionId,
      studyId: study.id,
      participantId: participant!.id,
      guideVersion: guide.version,
      guideSnapshot,
      voiceGender,
    });
    await tx.insert(consentRecords).values({
      participantId: participant!.id,
      sessionId,
      method: "click",
      grantedAt: new Date(),
      disclosureText,
      disclosureVersion: loadPhrases().version,
      disclosureSha256: createHash("sha256").update(disclosureText).digest("hex"),
      allowAudioPlayback: input.consent.allowAudioPlayback,
    });
  });
  return { ok: true, sessionId };
}
