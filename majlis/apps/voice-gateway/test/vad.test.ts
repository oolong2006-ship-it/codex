import { describe, expect, it } from "vitest";
import { EnergyVad, frameDbfs } from "../src/vad.js";
import { silence, tone } from "./audio-helpers.js";

describe("EnergyVad", () => {
  const make = () => new EnergyVad({ sampleRate: 16_000, minSpeechMs: 100, endSilenceMs: 500 });

  it("starts after min speech and ends after the silence window", () => {
    const vad = make();
    const events = [...tone(300), ...silence(600)].flatMap((f) => vad.push(f));
    expect(events).toEqual([
      { type: "speech_start", atMs: 100 },
      { type: "speech_end", atMs: 800, lastVoicedMs: 300 },
    ]);
  });

  it("ignores clicks shorter than min speech", () => {
    const vad = make();
    expect([...tone(60), ...silence(600)].flatMap((f) => vad.push(f))).toEqual([]);
  });

  it("does not end the turn on a short pause mid-sentence", () => {
    const vad = make();
    const events = [...tone(300), ...silence(300), ...tone(300), ...silence(600)].flatMap((f) =>
      vad.push(f),
    );
    expect(events.map((e) => e.type)).toEqual(["speech_start", "speech_end"]);
  });

  it("measures frame level", () => {
    expect(frameDbfs(silence(20)[0]!)).toBe(-Infinity);
    expect(frameDbfs(tone(20)[0]!)).toBeGreaterThan(-20);
  });
});
