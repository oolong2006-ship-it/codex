import { randomUUID } from "node:crypto";
import {
  appendTurn,
  contactPhone,
  contactSession,
  detachContactSession,
  enqueueJob,
  eraseWhatsappContact,
  recordVerbalConsent,
  saveEngineState,
  setSessionStatus,
  startWhatsappSession,
  type Db,
  type PiiKeys,
} from "@majlis/db";
import { normalizeForMatch } from "@majlis/dialect";
import { t } from "@majlis/i18n";
import { InterviewEngine, type InterviewGuide, type TranscriptEntry } from "@majlis/interviewer";
import type { AsrProvider, TtsProvider, WhatsAppProvider } from "@majlis/providers";
import type { ObjectStore } from "@majlis/storage";

export interface WhatsappDeps {
  db: Db;
  recordings: ObjectStore;
  provider: WhatsAppProvider;
  asr: AsrProvider;
  /** When set, replies are also sent as voice notes (TTS must produce OGG/Opus). */
  tts?: TtsProvider;
  keys: PiiKeys;
}

export interface InboundPayload {
  contactId: string;
  message: { messageId: string; kind: "text" | "audio"; text?: string; mediaId?: string };
}

const DELETE_WORDS = [
  "احذف",
  "احذفني",
  "حذف",
  "امسح بياناتي",
  "احذف بياناتي",
  "delete",
  "delete me",
].map(normalizeForMatch);
// Invite tokens are 16 url-safe characters (see createStudyFromObjective).
const INVITE = /(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{16})(?![A-Za-z0-9_-])/;

export function isDeleteRequest(text: string): boolean {
  return DELETE_WORDS.includes(normalizeForMatch(text));
}

export function extractInviteToken(text: string): string | null {
  return INVITE.exec(` ${text} `)?.[1] ?? null;
}

/**
 * One inbound WhatsApp message. Runs one at a time per contact (serial key),
 * so the interviewer state loaded here is always the latest.
 */
export async function handleWhatsappMessage(
  deps: WhatsappDeps,
  payload: InboundPayload,
): Promise<void> {
  const { db, provider } = deps;
  const phone = await contactPhone(db, payload.contactId, deps.keys);
  if (!phone) return; // erased in the meantime
  const send = (text: string) => provider.sendText(phone, text);

  let text = payload.message.text?.trim() ?? "";
  let audio: Uint8Array | undefined;
  let confidence: number | undefined;
  if (payload.message.kind === "audio" && payload.message.mediaId) {
    audio = await provider.downloadMedia(payload.message.mediaId);
    const result = await deps.asr.transcribe(audio, {
      language: "ar-SA",
      format: { encoding: "opus", sampleRateHz: 16_000, channels: 1 },
    });
    text = result.text.trim();
    confidence = result.confidence;
  }

  if (isDeleteRequest(text)) {
    await eraseWhatsappContact(db, deps.recordings, payload.contactId);
    await send(t("ar", "whatsapp.deleted"));
    return;
  }

  const session = await contactSession(db, payload.contactId);
  if (!session || session.status !== "active" || !session.engineState) {
    const token = extractInviteToken(text);
    if (!token) return void (await send(t("ar", "whatsapp.help")));
    const started = await startWhatsappSession(db, payload.contactId, token);
    if (!started) return void (await send(t("ar", "whatsapp.closed")));
    const engine = new InterviewEngine({ guide: started.guide, voiceGender: started.voiceGender });
    const first = engine.start();
    await persist(deps, started.sessionId, engine.transcript, undefined);
    await saveEngineState(db, started.sessionId, engine.exportState());
    // Honest about the channel before anything is asked; the disclosure goes last
    // because it ends with the consent question.
    await send(t("ar", "whatsapp.privacy"));
    await send(t("ar", "whatsapp.deleteHint"));
    await send(first.text);
    return;
  }

  const voiceGender = session.voiceGender === "male" ? "male" : "female";
  const engine = new InterviewEngine({ guide: session.guide as InterviewGuide, voiceGender });
  engine.importState(session.engineState);
  const before = engine.transcript.length;
  const hadConsent = Boolean(engine.consent);
  const turn = engine.respond({
    text,
    channel: audio ? "voice" : "text",
    ...(confidence !== undefined ? { asrConfidence: confidence } : {}),
  });

  await persist(deps, session.id, engine.transcript.slice(before), audio);
  if (!hadConsent && engine.consent) {
    await recordVerbalConsent(db, session.id, session.participantId, engine.consent, "message");
  }
  await saveEngineState(db, session.id, engine.exportState());

  if (turn.text) {
    await send(turn.text);
    if (deps.tts) {
      const chunks: Uint8Array[] = [];
      for await (const c of deps.tts.synthesize({
        text: turn.text,
        voiceGender,
        format: { encoding: "opus", sampleRateHz: 48_000, channels: 1 },
      })) {
        chunks.push(c);
      }
      if (chunks.length) await provider.sendVoiceNote(phone, Buffer.concat(chunks));
    }
  }

  if (turn.action === "close" || turn.action === "end_no_consent") {
    await setSessionStatus(db, session.id, turn.action === "close" ? "completed" : "no_consent", {
      dialectDetected: engine.dialect,
    });
    await detachContactSession(db, payload.contactId);
    if (turn.action === "close") {
      await enqueueJob(
        db,
        "analyze-session",
        { sessionId: session.id },
        { dedupeKey: `analyze:${session.id}` },
      );
    }
  }
}

async function persist(
  deps: WhatsappDeps,
  sessionId: string,
  entries: TranscriptEntry[],
  audio?: Uint8Array,
) {
  for (const e of entries) {
    let audioRef: string | undefined;
    if (audio && e.role === "participant") {
      audioRef = `recordings/${sessionId}/${randomUUID()}.ogg`;
      await deps.recordings.put(audioRef, audio, "audio/ogg");
    }
    await appendTurn(deps.db, sessionId, {
      role: e.role,
      text: e.text,
      ...(audioRef ? { audioRef } : {}),
      ...(e.asrConfidence !== undefined ? { asrConfidence: e.asrConfidence } : {}),
      ...(e.action ? { action: e.action } : {}),
      ...(e.questionId ? { questionId: e.questionId } : {}),
    });
  }
}
