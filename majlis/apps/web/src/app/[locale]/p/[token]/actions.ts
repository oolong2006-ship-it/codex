"use server";

import { startInterview, type StartResult } from "@majlis/db";
import { z } from "zod";
import { AGE_BANDS, CITIES, DIALECT_CODES, GENDERS } from "@/lib/options";
import { db } from "@/lib/server";

const Input = z.object({
  token: z.string().min(8).max(64),
  consentInterview: z.boolean(),
  consentAudio: z.boolean(),
  voiceGender: z.enum(GENDERS),
  gender: z.enum(GENDERS).optional(),
  ageBand: z.enum(AGE_BANDS).optional(),
  city: z.enum(CITIES).optional(),
  dialect: z.enum(DIALECT_CODES).optional(),
  screener: z.record(z.string().max(60), z.string().max(60)),
});

export type StartPayload = z.input<typeof Input>;

/** Records consent and creates the session; the interview cannot start any other way. */
export async function startInterviewAction(payload: StartPayload): Promise<StartResult> {
  const parsed = Input.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: "not_found" };
  const p = parsed.data;
  return startInterview(db(), {
    inviteToken: p.token,
    consent: { interview: p.consentInterview, allowAudioPlayback: p.consentAudio },
    participant: {
      ...(p.gender ? { gender: p.gender } : {}),
      ...(p.ageBand ? { ageBand: p.ageBand } : {}),
      ...(p.city ? { city: p.city } : {}),
      ...(p.dialect ? { dialect: p.dialect } : {}),
    },
    screenerAnswers: p.screener,
    voiceGender: p.voiceGender,
  });
}
