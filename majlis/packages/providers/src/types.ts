/**
 * Provider-neutral contracts. Business logic depends only on these interfaces;
 * concrete vendors live behind adapters selected by environment variables.
 */

export type ProviderKind = "asr" | "tts" | "llm" | "telephony" | "whatsapp";

export type VoiceGender = "male" | "female";

export interface AudioFormat {
  encoding: "pcm_s16le" | "opus" | "mp3" | "wav";
  sampleRateHz: number;
  channels: 1 | 2;
}

// ─── ASR ────────────────────────────────────────────────────────────────────

export interface AsrOptions {
  /** BCP-47 language hint, e.g. "ar-SA". */
  language: string;
  format: AudioFormat;
  /** Optional vocabulary boost (brand names, dialect words). */
  phraseHints?: readonly string[];
}

export interface AsrResult {
  text: string;
  /** 0..1 when the provider reports it; absent otherwise (never invented). */
  confidence?: number;
  /** Detected language tags if the provider reports code-switching. */
  languages?: readonly string[];
}

export type AsrStreamEvent =
  | ({ type: "partial" } & AsrResult)
  | ({ type: "final" } & AsrResult)
  | { type: "speech_started" }
  | { type: "speech_ended" };

export interface AsrStream extends AsyncIterable<AsrStreamEvent> {
  write(chunk: Uint8Array): void;
  /** Signals end of audio; the iterator completes after the last final event. */
  end(): void;
}

export interface AsrProvider {
  readonly name: string;
  transcribe(audio: Uint8Array, options: AsrOptions): Promise<AsrResult>;
  startStream(options: AsrOptions): AsrStream;
}

// ─── TTS ────────────────────────────────────────────────────────────────────

export interface TtsRequest {
  /** Already normalized text (numbers/currency spelled out in dialect). */
  text: string;
  /** Optional SSML; providers without SSML support fall back to `text`. */
  ssml?: string;
  voiceGender: VoiceGender;
  dialect?: string;
  format: AudioFormat;
  /** Aborting stops synthesis immediately (barge-in). */
  signal?: AbortSignal;
}

export interface TtsProvider {
  readonly name: string;
  synthesize(request: TtsRequest): AsyncIterable<Uint8Array>;
}

// ─── LLM ────────────────────────────────────────────────────────────────────

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  messages: readonly LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface LlmProvider {
  readonly name: string;
  /** Streams text deltas. */
  stream(request: LlmRequest): AsyncIterable<string>;
  complete(request: LlmRequest): Promise<string>;
}

// ─── Telephony (interface only in MVP) ──────────────────────────────────────

export interface OutboundCallRequest {
  /** Opaque participant reference; the phone number is resolved server-side only. */
  participantRef: string;
  sessionId: string;
}

export interface TelephonyProvider {
  readonly name: string;
  startOutboundCall(request: OutboundCallRequest): Promise<{ callId: string }>;
  hangUp(callId: string): Promise<void>;
}

// ─── WhatsApp (async voice notes) ───────────────────────────────────────────

export interface WhatsAppInboundMessage {
  messageId: string;
  participantRef: string;
  receivedAt: Date;
  kind: "text" | "audio";
  text?: string;
  mediaId?: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  sendText(participantRef: string, text: string): Promise<{ messageId: string }>;
  sendVoiceNote(participantRef: string, audio: Uint8Array): Promise<{ messageId: string }>;
  downloadMedia(mediaId: string): Promise<Uint8Array>;
  /** Verifies signature and parses a webhook payload; returns [] for non-message events. */
  parseWebhook(rawBody: string, signature: string | undefined): WhatsAppInboundMessage[];
}

export interface ProviderSet {
  asr: AsrProvider;
  tts: TtsProvider;
  llm: LlmProvider;
  telephony: TelephonyProvider;
  whatsapp: WhatsAppProvider;
}
