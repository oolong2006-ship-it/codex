import { FRAME_SAMPLES, INPUT_SAMPLE_RATE } from "./protocol.js";

/**
 * Streaming resampler + framer: float samples at the device rate in,
 * Int16 frames of FRAME_SAMPLES at INPUT_SAMPLE_RATE out. Pure, so it is
 * unit-tested here and inlined into the AudioWorklet.
 */
export class Framer {
  private readonly ratio: number;
  private position = 0;
  private pending: number[] = [];
  /** Last sample of the previous chunk, read at index -1 across chunk boundaries. */
  private last = 0;

  constructor(inputRate: number) {
    this.ratio = inputRate / INPUT_SAMPLE_RATE;
  }

  push(input: Float32Array): Int16Array[] {
    const frames: Int16Array[] = [];
    // Linear interpolation at fractional source positions.
    while (this.position + 1 < input.length) {
      const i = Math.floor(this.position);
      const frac = this.position - i;
      const left = i < 0 ? this.last : input[i]!;
      const sample = left * (1 - frac) + input[i + 1]! * frac;
      this.pending.push(Math.max(-1, Math.min(1, sample)));
      this.position += this.ratio;
      if (this.pending.length === FRAME_SAMPLES) {
        frames.push(Int16Array.from(this.pending, (s) => Math.round(s * 32767)));
        this.pending = [];
      }
    }
    if (input.length) this.last = input[input.length - 1]!;
    this.position -= input.length;
    return frames;
  }
}

export function int16ToFloat32(bytes: ArrayBuffer): Float32Array<ArrayBuffer> {
  const pcm = new Int16Array(bytes);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i]! / 32768;
  return out;
}

export function rms(samples: Float32Array | Int16Array): number {
  if (samples.length === 0) return 0;
  const scale = samples instanceof Int16Array ? 32768 : 1;
  let sum = 0;
  for (const s of samples) sum += (s / scale) ** 2;
  return Math.sqrt(sum / samples.length);
}

/**
 * Plain-JS copy of Framer for the AudioWorklet (worklets cannot import modules
 * reliably across bundlers, and minification must not rename anything here).
 * A unit test checks that it produces exactly the same frames as Framer.
 */
export const FRAMER_JS = `
class Framer {
  constructor(inputRate) { this.ratio = inputRate / ${INPUT_SAMPLE_RATE}; this.position = 0; this.pending = []; this.last = 0; }
  push(input) {
    const frames = [];
    while (this.position + 1 < input.length) {
      const i = Math.floor(this.position);
      const frac = this.position - i;
      const left = i < 0 ? this.last : input[i];
      const sample = left * (1 - frac) + input[i + 1] * frac;
      this.pending.push(Math.max(-1, Math.min(1, sample)));
      this.position += this.ratio;
      if (this.pending.length === ${FRAME_SAMPLES}) {
        frames.push(Int16Array.from(this.pending, (s) => Math.round(s * 32767)));
        this.pending = [];
      }
    }
    if (input.length) this.last = input[input.length - 1];
    this.position -= input.length;
    return frames;
  }
}`;

export const WORKLET_SOURCE = `${FRAMER_JS}
class MajlisCapture extends AudioWorkletProcessor {
  constructor() { super(); this.framer = new Framer(sampleRate); }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) for (const f of this.framer.push(channel)) this.port.postMessage(f, [f.buffer]);
    return true;
  }
}
registerProcessor("majlis-capture", MajlisCapture);
`;
