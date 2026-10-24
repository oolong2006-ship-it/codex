import { describe, expect, it } from "vitest";
import { FRAME_SAMPLES, FRAMER_JS, Framer, rms } from "../src/index.js";

const sine = (rate: number, seconds: number, freq = 440) =>
  Float32Array.from(
    { length: Math.round(rate * seconds) },
    (_, n) => Math.sin((2 * Math.PI * freq * n) / rate) * 0.5,
  );

describe("Framer", () => {
  it("resamples 48 kHz input into 20 ms frames at 16 kHz", () => {
    const framer = new Framer(48_000);
    const input = sine(48_000, 1);
    const frames = [0, 1, 2, 3].flatMap((i) =>
      framer.push(input.subarray(i * 12_000, (i + 1) * 12_000)),
    );
    expect(frames).toHaveLength(50); // one second → 16000 samples → 50 frames, none lost at chunk edges
    expect(frames.every((f) => f.length === FRAME_SAMPLES)).toBe(true);
    // Chunk boundaries must not produce gaps or NaN (regression).
    expect(frames.every((f) => f.every((s) => Number.isFinite(s)))).toBe(true);
    const all = Int16Array.from(frames.flatMap((f) => [...f]));
    const jumps = all.slice(1).map((s, i) => Math.abs(s - all[i]!));
    // Max step of a 440 Hz, 0.5-amplitude sine at 16 kHz is 16383·2π·440/16000 ≈ 2831.
    expect(Math.max(...jumps)).toBeLessThan(2900);
    expect(rms(frames[10]!)).toBeCloseTo(0.5 / Math.SQRT2, 1);
  });

  it("matches the AudioWorklet copy exactly", () => {
    const WorkletFramer = new Function(`${FRAMER_JS}; return Framer;`)() as typeof Framer;
    const a = new Framer(44_100);
    const b = new WorkletFramer(44_100);
    const input = sine(44_100, 0.5, 300);
    for (let i = 0; i < input.length; i += 128) {
      const chunk = input.subarray(i, i + 128);
      expect(b.push(chunk)).toEqual(a.push(chunk));
    }
  });
});
