/**
 * Wire protocol between the participant's browser and the voice gateway.
 *
 * Text frames carry JSON messages below. Binary frames carry audio:
 * - client → server: PCM s16le mono at INPUT_SAMPLE_RATE, FRAME_MS per frame;
 * - server → client: PCM s16le mono for the turn announced by the last
 *   `audio_start`, at the sample rate given there.
 * There is no video in this protocol by design.
 */

export const PROTOCOL_VERSION = 1;
export const INPUT_SAMPLE_RATE = 16_000;
export const FRAME_MS = 20;
export const FRAME_SAMPLES = (INPUT_SAMPLE_RATE * FRAME_MS) / 1000;

export type Mode = "voice" | "text";
export type VoiceGender = "male" | "female";

export type ClientMessage =
  | {
      type: "hello";
      protocol: number;
      mode: Mode;
      voiceGender: VoiceGender;
      participantGender?: VoiceGender;
    }
  | { type: "text"; text: string }
  | { type: "mode"; mode: Mode }
  | { type: "playback"; turnId: string; state: "started" | "ended" | "stopped" }
  | { type: "end" };

export interface TurnLatency {
  turnId: string;
  /** Participant's last voiced frame → first reply audio sent by the gateway. */
  responseMs: number;
  endpointMs: number;
  asrMs: number;
  thinkMs: number;
  ttsFirstChunkMs: number;
}

export interface LatencySummary {
  turns: number;
  responseMs: { p50: number | null; p90: number | null };
  /** Includes the trip back to the browser and its audio buffer (upper bound). */
  perceivedMs: { p50: number | null; p90: number | null };
  bargeIns: number;
  /** Speech detected → cancel sent, per barge-in. */
  bargeInCancelMs: { p50: number | null; max: number | null };
}

export type ServerMessage =
  | { type: "ready"; sessionId: string; inputSampleRate: number; frameMs: number }
  | {
      type: "turn";
      turnId: string;
      action: string;
      text: string;
      questionId?: string;
      textModeOffered: boolean;
    }
  | { type: "audio_start"; turnId: string; sampleRate: number; encoding: "pcm_s16le" }
  | { type: "audio_end"; turnId: string }
  | { type: "audio_cancel"; turnId: string; reason: "barge_in" }
  | { type: "vad"; speaking: boolean }
  | { type: "transcript"; text: string; final: boolean }
  | ({ type: "latency" } & TurnLatency)
  | { type: "ended"; reason: "completed" | "no_consent" | "client_end"; latency: LatencySummary }
  | { type: "error"; code: string; message: string };

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const msg = JSON.parse(raw) as { type?: unknown };
    return typeof msg.type === "string" ? (msg as ServerMessage) : null;
  } catch {
    return null;
  }
}
