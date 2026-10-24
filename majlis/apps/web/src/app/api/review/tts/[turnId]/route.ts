import { interviewerTurnForReview } from "@majlis/db";
import { normalizeForSpeech } from "@majlis/dialect";
import { createProviders } from "@majlis/providers";
import { pcmToWav } from "@majlis/storage";
import { canReview, currentUser, db } from "@/lib/server";

export const dynamic = "force-dynamic";

/** An interviewer line re-synthesized by the configured TTS, for MOS ratings. */
export async function GET(_req: Request, { params }: { params: Promise<{ turnId: string }> }) {
  const { turnId } = await params;
  const user = await currentUser();
  if (!user || !canReview(user) || !/^[0-9a-f-]{36}$/.test(turnId)) {
    return new Response(null, { status: 404 });
  }
  const turn = await interviewerTurnForReview(db(), user.orgId, turnId);
  if (!turn) return new Response(null, { status: 404 });
  const chunks: Uint8Array[] = [];
  for await (const c of createProviders().tts.synthesize({
    // Spoken exactly as in the interview: numbers and currency in words.
    text: normalizeForSpeech(turn.text),
    voiceGender: turn.voiceGender,
    format: { encoding: "pcm_s16le", sampleRateHz: 16_000, channels: 1 },
  })) {
    chunks.push(c);
  }
  return new Response(Buffer.from(pcmToWav(Buffer.concat(chunks))), {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-store" },
  });
}
