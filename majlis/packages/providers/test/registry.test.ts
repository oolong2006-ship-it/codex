import { describe, expect, it } from "vitest";
import {
  MockAsrProvider,
  MockLlmProvider,
  MockTtsProvider,
  ProviderConfigError,
  createProviders,
} from "../src/index.js";

describe("createProviders", () => {
  it("defaults every kind to mock", () => {
    const providers = createProviders({});
    expect(Object.values(providers).map((p) => p.name)).toEqual([
      "mock",
      "mock",
      "mock",
      "mock",
      "mock",
    ]);
  });

  it("rejects an unknown provider with an actionable message", () => {
    expect(() => createProviders({ ASR_PROVIDER: "nope" })).toThrow(ProviderConfigError);
    expect(() => createProviders({ ASR_PROVIDER: "nope" })).toThrow(/ASR_PROVIDER/);
  });
});

describe("mock providers", () => {
  it("streams a scripted ASR final after end()", async () => {
    const asr = new MockAsrProvider([{ text: "هلا والله", confidence: 0.93 }]);
    const stream = asr.startStream({
      language: "ar-SA",
      format: { encoding: "pcm_s16le", sampleRateHz: 16000, channels: 1 },
    });
    stream.write(new Uint8Array(320));
    stream.end();
    const events = [];
    for await (const e of stream) events.push(e);
    expect(events.map((e) => e.type)).toEqual(["speech_started", "speech_ended", "final"]);
    expect(events.at(-1)).toMatchObject({ text: "هلا والله", confidence: 0.93 });
  });

  it("stops TTS synthesis when aborted (barge-in)", async () => {
    const tts = new MockTtsProvider();
    const controller = new AbortController();
    let chunks = 0;
    for await (const _chunk of tts.synthesize({
      text: "واحد اثنين ثلاثة أربعة",
      voiceGender: "female",
      format: { encoding: "pcm_s16le", sampleRateHz: 16000, channels: 1 },
      signal: controller.signal,
    })) {
      chunks += 1;
      if (chunks === 2) controller.abort();
    }
    expect(chunks).toBe(2);
  });

  it("returns scripted LLM replies in order", async () => {
    const llm = new MockLlmProvider(["أهلين", "زين"]);
    expect(await llm.complete({ messages: [] })).toBe("أهلين");
    expect(await llm.complete({ messages: [] })).toBe("زين");
  });
});
