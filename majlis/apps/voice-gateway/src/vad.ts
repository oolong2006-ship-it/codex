/**
 * Energy-based voice activity detector with endpointing, driven by audio time
 * (not wall time) so behaviour is deterministic. It sits behind an interface so
 * a model-based VAD (e.g. Silero) can replace it without touching the pipeline.
 */

export type VadEvent =
  | { type: "speech_start"; atMs: number }
  | { type: "speech_end"; atMs: number; lastVoicedMs: number };

export interface Vad {
  /** Feeds one PCM s16le frame; returns events in order. */
  push(frame: Int16Array): VadEvent[];
  readonly speaking: boolean;
  /** Whether the most recent frame was voiced. */
  readonly lastFrameVoiced: boolean;
}

export interface EnergyVadOptions {
  sampleRate: number;
  /** Frames louder than this (dBFS) count as voiced. */
  thresholdDbfs?: number;
  /** Voiced audio needed before speech_start (filters clicks and short noises). */
  minSpeechMs?: number;
  /** Silence needed after speech before speech_end (end-of-turn). */
  endSilenceMs?: number;
}

export function frameDbfs(frame: Int16Array): number {
  if (frame.length === 0) return -Infinity;
  let sum = 0;
  for (const s of frame) sum += (s / 32768) ** 2;
  const rms = Math.sqrt(sum / frame.length);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

export class EnergyVad implements Vad {
  private clockMs = 0;
  private voicedRunMs = 0;
  private silenceRunMs = 0;
  private lastVoicedMs = 0;
  private active = false;
  private voicedNow = false;
  private readonly threshold: number;
  private readonly minSpeechMs: number;
  private readonly endSilenceMs: number;

  constructor(private readonly options: EnergyVadOptions) {
    this.threshold = options.thresholdDbfs ?? -40;
    this.minSpeechMs = options.minSpeechMs ?? 100;
    this.endSilenceMs = options.endSilenceMs ?? 500;
  }

  get speaking(): boolean {
    return this.active;
  }

  get lastFrameVoiced(): boolean {
    return this.voicedNow;
  }

  push(frame: Int16Array): VadEvent[] {
    const durationMs = (frame.length / this.options.sampleRate) * 1000;
    this.clockMs += durationMs;
    const voiced = frameDbfs(frame) >= this.threshold;
    this.voicedNow = voiced;
    const events: VadEvent[] = [];

    if (voiced) {
      this.voicedRunMs += durationMs;
      this.silenceRunMs = 0;
      this.lastVoicedMs = this.clockMs;
      if (!this.active && this.voicedRunMs >= this.minSpeechMs) {
        this.active = true;
        events.push({ type: "speech_start", atMs: this.clockMs });
      }
    } else {
      this.silenceRunMs += durationMs;
      if (!this.active) this.voicedRunMs = 0;
      if (this.active && this.silenceRunMs >= this.endSilenceMs) {
        this.active = false;
        this.voicedRunMs = 0;
        events.push({ type: "speech_end", atMs: this.clockMs, lastVoicedMs: this.lastVoicedMs });
      }
    }
    return events;
  }
}
