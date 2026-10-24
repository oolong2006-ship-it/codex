import { FRAME_SAMPLES, INPUT_SAMPLE_RATE } from "@majlis/voice-client/protocol";

const frames = (ms: number, sample: (n: number) => number): Int16Array[] => {
  const out: Int16Array[] = [];
  let n = 0;
  for (let i = 0; i < ms / 20; i++) {
    out.push(Int16Array.from({ length: FRAME_SAMPLES }, () => sample(n++)));
  }
  return out;
};

/** Loud 220 Hz tone, well above the VAD threshold. */
export const tone = (ms: number) =>
  frames(ms, (n) => Math.round(8000 * Math.sin((2 * Math.PI * 220 * n) / INPUT_SAMPLE_RATE)));

export const silence = (ms: number) => frames(ms, () => 0);
