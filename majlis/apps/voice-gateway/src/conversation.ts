import type { Dialect } from "@majlis/dialect";
import type { AsrResult, AsrStream, ProviderSet } from "@majlis/providers";
import {
  Interviewer,
  type ConsentRecord,
  type EngineSnapshot,
  type SpokenTurn,
  type TranscriptEntry,
} from "@majlis/interviewer";
import {
  FRAME_MS,
  INPUT_SAMPLE_RATE,
  PROTOCOL_VERSION,
  type ClientMessage,
  type LatencySummary,
  type Mode,
  type ServerMessage,
} from "@majlis/voice-client/protocol";
import type { GatewayConfig } from "./config.js";
import { LatencyTracker } from "./latency.js";
import type { SessionRecord } from "./sessions.js";
import { EnergyVad, type Vad } from "./vad.js";

/** Audio kept from before speech onset so the first syllable is not clipped. */
const PREROLL_MS = 300;

export type EndStatus = "completed" | "no_consent" | "abandoned";

export interface ConversationDeps {
  session: SessionRecord;
  providers: ProviderSet;
  config: GatewayConfig;
  sendJson: (msg: ServerMessage) => void;
  sendAudio: (chunk: Uint8Array) => void;
  onEnd: (status: EndStatus, latency: LatencySummary, dialect: Dialect | null) => void;
  /** Stores committed turns only: a reply taken back before it was heard is never saved. */
  persist?: {
    turns: (
      entries: TranscriptEntry[],
      dialect: Dialect | null,
      /** Recorded PCM (16 kHz mono) of a participant entry, when spoken. */
      audioFor: (entry: TranscriptEntry) => Uint8Array | undefined,
    ) => Promise<void>;
    consent: (record: ConsentRecord) => Promise<void>;
  };
  onPersistError?: (err: unknown) => void;
  now?: () => number;
  vad?: Vad;
  seed?: number;
}

interface Timing {
  endOfSpeech: number;
  endpoint: number;
  asrFinal?: number;
}

/** A reply that has been planned but not yet heard; it can still be taken back. */
interface Pending {
  controller: AbortController;
  snapshot?: EngineSnapshot;
  retracted: boolean;
}

/** A reply the participant is hearing (streaming or still playing in the browser). */
interface Speaking {
  turnId: string;
  controller: AbortController;
  streaming: boolean;
  endOfSpeech?: number;
  fallbackTimer?: ReturnType<typeof setTimeout>;
}

/**
 * One participant connection. Pipeline per turn:
 *   mic frames → VAD → streaming ASR → interviewer → TTS (sentence by sentence) → browser.
 *
 * Two rules keep the interviewer from talking over the participant:
 * - barge-in: speech detected while a reply is audible cancels it at once;
 * - retraction: speech that resumes before a planned reply is audible takes the
 *   reply back, restores the interview state and merges both utterances.
 */
export class Conversation {
  readonly latency = new LatencyTracker();
  private interviewer: Interviewer | null = null;
  private mode: Mode = "voice";
  private readonly vad: Vad;
  private preroll: Int16Array[] = [];
  private asr: { stream: AsrStream; final: Promise<AsrResult>; audio: Uint8Array[] } | null = null;
  private lastVoicedAt = 0;
  private pending: Pending | null = null;
  private speaking: Speaking | null = null;
  private carry = "";
  private carryAudio: Uint8Array[] = [];
  /** Recording of each participant utterance, attached once the engine has logged it. */
  private readonly audioByEntry = new WeakMap<TranscriptEntry, Uint8Array>();
  private turnCounter = 0;
  private queue: Promise<void> = Promise.resolve();
  private finished = false;
  private readonly now: () => number;
  private voiceGender: "male" | "female" = "female";
  private persisted = 0;
  private consentPersisted = false;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ConversationDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.vad =
      deps.vad ??
      new EnergyVad({
        sampleRate: INPUT_SAMPLE_RATE,
        thresholdDbfs: deps.config.vad.thresholdDbfs,
        minSpeechMs: deps.config.vad.minSpeechMs,
        endSilenceMs: deps.config.vad.endSilenceMs,
      });
  }

  /** Resolves when all queued work (utterances, replies, storage) has finished. */
  async idle(): Promise<void> {
    await this.queue;
    await this.persistQueue;
  }

  // ─── inbound ────────────────────────────────────────────────────────────────

  handleText(raw: string): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return this.error("bad_message", "invalid JSON");
    }
    switch (msg.type) {
      case "hello":
        return this.hello(msg);
      case "text":
        if (!this.interviewer || typeof msg.text !== "string") return;
        this.cancelAudible();
        this.enqueue(Promise.resolve({ text: msg.text.slice(0, 2000) }), undefined, "text");
        return;
      case "mode":
        this.mode = msg.mode === "text" ? "text" : "voice";
        if (this.mode === "text") this.closeAsr();
        return;
      case "playback":
        return this.playback(msg.turnId, msg.state);
      case "end":
        return this.finish("abandoned", "client_end");
      default:
        return this.error("bad_message", "unknown message type");
    }
  }

  handleAudio(frame: Int16Array): void {
    if (!this.interviewer || this.mode !== "voice" || this.finished) return;
    const now = this.now();
    const events = this.vad.push(frame);
    if (this.vad.lastFrameVoiced) this.lastVoicedAt = now;

    this.preroll.push(frame);
    if (this.preroll.length > PREROLL_MS / FRAME_MS) this.preroll.shift();

    let opened = false;
    for (const event of events) {
      if (event.type === "speech_start") {
        this.onSpeechStart(now);
        opened = true;
      } else {
        this.feedAsr(frame);
        this.onSpeechEnd(now);
      }
    }
    if (!opened && events.length === 0 && this.asr) this.feedAsr(frame);
  }

  close(): void {
    if (!this.finished) this.finish("abandoned");
  }

  // ─── speech events ──────────────────────────────────────────────────────────

  private onSpeechStart(now: number): void {
    this.deps.sendJson({ type: "vad", speaking: true });
    this.cancelAudible(now);
    this.closeAsr();
    const stream = this.deps.providers.asr.startStream({
      language: "ar-SA",
      format: { encoding: "pcm_s16le", sampleRateHz: INPUT_SAMPLE_RATE, channels: 1 },
    });
    const audio: Uint8Array[] = [];
    for (const f of this.preroll) {
      stream.write(asBytes(f));
      audio.push(asBytes(f).slice());
    }
    const final = (async (): Promise<AsrResult> => {
      for await (const event of stream) {
        if (event.type === "final") {
          return {
            text: event.text,
            ...(event.confidence !== undefined ? { confidence: event.confidence } : {}),
          };
        }
      }
      return { text: "" };
    })();
    this.asr = { stream, final, audio };
  }

  private onSpeechEnd(now: number): void {
    this.deps.sendJson({ type: "vad", speaking: false });
    const asr = this.asr;
    this.asr = null;
    if (!asr) return;
    asr.stream.end();
    this.enqueue(asr.final, { endOfSpeech: this.lastVoicedAt, endpoint: now }, "voice", asr.audio);
  }

  /** Barge-in for audible replies, retraction for planned ones. */
  private cancelAudible(now = this.now()): void {
    if (this.speaking) {
      const { turnId, controller, fallbackTimer } = this.speaking;
      controller.abort();
      if (fallbackTimer) clearTimeout(fallbackTimer);
      this.speaking = null;
      this.deps.sendJson({ type: "audio_cancel", turnId, reason: "barge_in" });
      this.latency.addBargeIn(this.now() - now);
    }
    if (this.pending) {
      this.pending.retracted = true;
      this.pending.controller.abort();
      if (this.pending.snapshot) this.interviewer!.engine.restore(this.pending.snapshot);
      this.pending = null;
    }
  }

  private feedAsr(frame: Int16Array): void {
    if (!this.asr) return;
    this.asr.stream.write(asBytes(frame));
    this.asr.audio.push(asBytes(frame).slice());
  }

  private closeAsr(): void {
    this.asr?.stream.end();
    this.asr = null;
  }

  // ─── turns ──────────────────────────────────────────────────────────────────

  private enqueue(
    final: Promise<AsrResult>,
    timing: Timing | undefined,
    channel: Mode,
    audio: Uint8Array[] = [],
  ): void {
    const pending: Pending = { controller: new AbortController(), retracted: false };
    if (channel === "voice") this.pending = pending;
    this.queue = this.queue
      .then(() => this.process(final, timing, channel, pending, audio))
      .catch((err: unknown) =>
        this.error("internal", err instanceof Error ? err.message : String(err)),
      );
  }

  private async process(
    finalPromise: Promise<AsrResult>,
    timing: Timing | undefined,
    channel: Mode,
    pending: Pending,
    audio: Uint8Array[],
  ): Promise<void> {
    const final = await finalPromise;
    if (timing) timing.asrFinal = this.now();
    const text = [this.carry, final.text.trim()].filter(Boolean).join(" ");
    const recording = [...this.carryAudio, ...audio];
    if (pending.retracted || this.finished) {
      this.carry = text;
      this.carryAudio = recording;
      return;
    }
    this.carry = "";
    this.carryAudio = [];
    if (channel === "voice" && final.text.trim()) {
      this.deps.sendJson({ type: "transcript", text, final: true });
    }

    const engine = this.interviewer!.engine;
    pending.snapshot = engine.snapshot();
    const loggedAt = engine.transcript.length;
    const turn = await this.interviewer!.respond(
      {
        text,
        channel,
        ...(final.confidence !== undefined ? { asrConfidence: final.confidence } : {}),
      },
      pending.controller.signal,
    );
    const thinkDone = this.now();
    const entry = engine.transcript[loggedAt];
    if (entry?.role === "participant" && recording.length) {
      this.audioByEntry.set(entry, concat(recording));
    }
    if (!pending.retracted) await this.speak(turn, pending, timing, thinkDone);
    // Retraction can land while thinking or while TTS warms up; either way the
    // words were never heard, so they are carried into the next utterance.
    if (pending.retracted) {
      this.carry = text;
      this.carryAudio = recording;
    }
  }

  private async speak(
    turn: SpokenTurn,
    pending: Pending,
    timing: Timing | undefined,
    thinkDone: number,
  ): Promise<void> {
    const turnId = `t${++this.turnCounter}`;
    const turnMsg: ServerMessage = {
      type: "turn",
      turnId,
      action: turn.action,
      text: turn.text,
      ...(turn.questionId ? { questionId: turn.questionId } : {}),
      textModeOffered: this.interviewer!.engine.textModeOffered,
    };
    if (turn.action === "noop") return;

    if (this.mode === "text" || !turn.speech) {
      if (this.pending === pending) this.pending = null;
      this.commit();
      this.deps.sendJson(turnMsg);
      return this.afterTurn(turn);
    }

    const { signal } = pending.controller;
    const rate = this.deps.config.ttsSampleRate;
    let started = false;
    let bytes = 0;
    try {
      for (const sentence of splitSentences(turn.speech)) {
        for await (const chunk of this.deps.providers.tts.synthesize({
          text: sentence,
          voiceGender: this.voiceGender,
          format: { encoding: "pcm_s16le", sampleRateHz: rate, channels: 1 },
          signal,
        })) {
          if (signal.aborted) return;
          if (!started) {
            started = true;
            const firstChunk = this.now();
            if (this.pending === pending) this.pending = null;
            this.speaking = {
              turnId,
              controller: pending.controller,
              streaming: true,
              ...(timing ? { endOfSpeech: timing.endOfSpeech } : {}),
            };
            this.commit();
            this.deps.sendJson(turnMsg);
            this.deps.sendJson({
              type: "audio_start",
              turnId,
              sampleRate: rate,
              encoding: "pcm_s16le",
            });
            if (timing) this.recordLatency(turnId, timing, thinkDone, firstChunk);
          }
          bytes += chunk.byteLength;
          this.deps.sendAudio(chunk);
        }
        if (signal.aborted) return;
      }
    } catch (err) {
      if (signal.aborted) return;
      throw err;
    }

    if (!started) {
      // TTS produced nothing; the participant still gets the words.
      if (this.pending === pending) this.pending = null;
      this.commit();
      this.deps.sendJson(turnMsg);
    } else {
      this.deps.sendJson({ type: "audio_end", turnId });
      if (this.speaking?.turnId === turnId) {
        this.speaking.streaming = false;
        // If the browser never reports playback end, stop treating the reply as audible.
        const durationMs = (bytes / 2 / rate) * 1000;
        this.speaking.fallbackTimer = setTimeout(() => {
          if (this.speaking?.turnId === turnId) this.speaking = null;
        }, durationMs + 2000);
      }
    }
    this.afterTurn(turn);
  }

  /** Persists transcript entries (and a verbal consent) that are now final. */
  private commit(): void {
    const engine = this.interviewer!.engine;
    const fresh = engine.transcript.slice(this.persisted);
    this.persisted = engine.transcript.length;
    const dialect = engine.dialect;
    const consent = !this.consentPersisted && engine.consent ? engine.consent : null;
    if (consent) this.consentPersisted = true;
    const persist = this.deps.persist;
    if (!persist || (!fresh.length && !consent)) return;
    this.persistQueue = this.persistQueue
      .then(async () => {
        if (fresh.length) await persist.turns(fresh, dialect, (e) => this.audioByEntry.get(e));
        if (consent) await persist.consent(consent);
      })
      .catch((err: unknown) => this.deps.onPersistError?.(err));
  }

  private recordLatency(turnId: string, t: Timing, thinkDone: number, firstChunk: number): void {
    const asrFinal = t.asrFinal ?? t.endpoint;
    const entry = {
      turnId,
      responseMs: firstChunk - t.endOfSpeech,
      endpointMs: t.endpoint - t.endOfSpeech,
      asrMs: asrFinal - t.endpoint,
      thinkMs: thinkDone - asrFinal,
      ttsFirstChunkMs: firstChunk - thinkDone,
    };
    this.latency.addTurn(entry);
    this.deps.sendJson({ type: "latency", ...entry });
  }

  private playback(turnId: string, state: "started" | "ended" | "stopped"): void {
    const speaking = this.speaking;
    if (!speaking || speaking.turnId !== turnId) return;
    if (state === "started" && speaking.endOfSpeech !== undefined) {
      this.latency.addPerceived(this.now() - speaking.endOfSpeech);
    }
    if ((state === "ended" || state === "stopped") && !speaking.streaming) {
      if (speaking.fallbackTimer) clearTimeout(speaking.fallbackTimer);
      this.speaking = null;
    }
  }

  private afterTurn(turn: SpokenTurn): void {
    if (turn.action === "close") this.finish("completed", "completed");
    else if (turn.action === "end_no_consent") this.finish("no_consent", "no_consent");
  }

  private hello(msg: Extract<ClientMessage, { type: "hello" }>): void {
    if (this.interviewer) return this.error("bad_message", "hello already received");
    if (msg.protocol !== PROTOCOL_VERSION) {
      return this.error("protocol", `unsupported protocol ${String(msg.protocol)}`);
    }
    const { session, config, providers } = this.deps;
    this.mode = msg.mode === "text" ? "text" : "voice";
    this.voiceGender =
      session.settings.voiceGender ?? (msg.voiceGender === "male" ? "male" : "female");
    const participantGender =
      msg.participantGender === "male" || msg.participantGender === "female"
        ? msg.participantGender
        : undefined;
    this.interviewer = new Interviewer({
      guide: session.guide,
      voiceGender: this.voiceGender,
      ...(participantGender ? { participantGender } : {}),
      ...(session.settings.dialect ? { dialect: session.settings.dialect } : {}),
      ...(config.llmRephrase ? { llm: providers.llm } : {}),
      seed: this.deps.seed ?? Math.floor(Math.random() * 2 ** 31),
    });
    this.deps.sendJson({
      type: "ready",
      sessionId: session.id,
      inputSampleRate: INPUT_SAMPLE_RATE,
      frameMs: FRAME_MS,
    });
    const pending: Pending = { controller: new AbortController(), retracted: false };
    this.queue = this.queue.then(async () => {
      const turn = await this.interviewer!.start();
      await this.speak(turn, pending, undefined, this.now());
    });
  }

  private finish(status: EndStatus, reason?: "completed" | "no_consent" | "client_end"): void {
    if (this.finished) return;
    this.finished = true;
    this.closeAsr();
    if (this.speaking?.fallbackTimer) clearTimeout(this.speaking.fallbackTimer);
    const summary = this.latency.summary();
    if (reason) this.deps.sendJson({ type: "ended", reason, latency: summary });
    const dialect = this.interviewer?.engine.dialect ?? null;
    // Storage of the last turns finishes before the session is marked as ended.
    this.persistQueue = this.persistQueue.then(() => this.deps.onEnd(status, summary, dialect));
  }

  private error(code: string, message: string): void {
    this.deps.sendJson({ type: "error", code, message });
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

function asBytes(frame: Int16Array): Uint8Array {
  return new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
}

/** Splits speech into sentences so TTS can start on the first one. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.؟?!])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}
