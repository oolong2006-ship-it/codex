import { describe, expect, it } from "vitest";
import { silence, tone } from "./audio-helpers.js";
import { harness, sleep } from "./harness.js";

const hello = (mode: "voice" | "text" = "voice") => ({
  type: "hello",
  protocol: 1,
  mode,
  voiceGender: "female",
});

describe("Conversation — text mode", () => {
  it("runs a typed interview to the end without audio", async () => {
    const h = await harness();
    h.send(hello("text"));
    await h.conversation.idle();
    expect(h.of("ready")).toHaveLength(1);
    expect(h.of("turn")[0]).toMatchObject({ action: "disclose" });
    expect(h.of("turn")[0]!.text).toContain("مساعدة ذكية");

    for (const text of [
      "إيه",
      "اخترته لأنه قريب من البيت وأكله نظيف",
      "الطلب كان سريع والاستلام من السيارة سهل",
      "أوسّع الجلسات العائلية وأخلي الإضاءة أهدى",
    ]) {
      h.send({ type: "text", text });
      await h.conversation.idle();
    }
    expect(h.of("turn").map((t) => t.action)).toEqual(["disclose", "ask", "ask", "ask", "close"]);
    expect(h.audio).toHaveLength(0);
    expect(h.of("ended")[0]).toMatchObject({ reason: "completed" });
    await h.conversation.idle();
    expect(h.ended.status).toBe("completed");
    expect(h.stored).toHaveLength(9);
    expect(
      h.stored.filter((e) => e.role === "participant").every((e) => e.asrConfidence === undefined),
    ).toBe(true);
  });

  it("rejects a second hello and a wrong protocol", async () => {
    const h = await harness();
    h.send({ ...hello(), protocol: 99 });
    expect(h.of("error")[0]).toMatchObject({ code: "protocol" });
    h.send(hello("text"));
    h.send(hello("text"));
    expect(h.of("error").at(-1)).toMatchObject({ code: "bad_message" });
  });
});

describe("Conversation — voice", () => {
  it("speaks the disclosure, then answers a spoken reply with measured latency", async () => {
    const h = await harness({ asr: [{ text: "إيه نبدأ", confidence: 0.92 }] });
    h.send(hello());
    await h.conversation.idle();
    expect(h.of("audio_start")).toHaveLength(1);
    expect(h.audio.length).toBeGreaterThan(5);
    h.heard();

    h.say(400);
    await h.conversation.idle();
    expect(h.of("transcript")[0]).toMatchObject({ text: "إيه نبدأ", final: true });
    expect(h.of("turn")[1]).toMatchObject({ action: "ask", questionId: "q1" });

    const [lat] = h.of("latency");
    expect(lat!.endpointMs).toBeGreaterThanOrEqual(480);
    expect(lat!.endpointMs).toBeLessThanOrEqual(560);
    expect(lat!.responseMs).toBeGreaterThanOrEqual(lat!.endpointMs);
    expect(lat!.responseMs).toBeCloseTo(
      lat!.endpointMs + lat!.asrMs + lat!.thinkMs + lat!.ttsFirstChunkMs,
      5,
    );
  });

  it("stops talking the moment the participant speaks (barge-in while streaming)", async () => {
    const h = await harness({ tts: { chunkDelayMs: 25 } });
    h.send(hello());
    await h.waitFor(() => h.of("audio_start").length === 1 && h.audio.length >= 3);
    h.feed(tone(200));
    await h.conversation.idle();

    const turnId = h.of("audio_start")[0]!.turnId;
    expect(h.of("audio_cancel")).toEqual([{ type: "audio_cancel", turnId, reason: "barge_in" }]);
    expect(h.of("audio_end")).toHaveLength(0);
    const sentAfterCancel = h.audio.length;
    await sleep(100);
    expect(h.audio.length).toBe(sentAfterCancel); // nothing more is streamed
    expect(h.conversation.latency.summary().bargeIns).toBe(1);
    expect(h.conversation.latency.summary().bargeInCancelMs.max).toBeLessThan(5);
  });

  it("also cancels a reply that finished streaming but is still playing in the browser", async () => {
    const h = await harness();
    h.send(hello());
    await h.conversation.idle();
    expect(h.of("audio_end")).toHaveLength(1);
    h.feed(tone(200)); // no playback "ended" received yet → still audible
    expect(h.of("audio_cancel")).toHaveLength(1);
  });

  it("ignores clicks shorter than the minimum speech length", async () => {
    const h = await harness({ tts: { chunkDelayMs: 25 } });
    h.send(hello());
    await h.waitFor(() => h.audio.length >= 2);
    h.feed([...tone(40), ...silence(100)]);
    expect(h.of("audio_cancel")).toHaveLength(0);
  });

  it("takes back a planned reply when the participant keeps talking, and merges both parts", async () => {
    const h = await harness({
      asr: [
        { text: "إيه", confidence: 0.9 },
        { text: "عادي", confidence: 0.9 },
        { text: "بس لأنه قريب من البيت والأكل نظيف", confidence: 0.9 },
      ],
      tts: { firstChunkDelayMs: 150 },
    });
    h.send(hello());
    await h.conversation.idle();
    h.heard();
    h.say(300); // consent
    await h.conversation.idle();
    h.heard();

    h.say(300); // "عادي" → a follow-up gets planned...
    await sleep(60); // ...the engine has answered and TTS is warming up
    h.feed(tone(300)); // ...but the participant goes on before anything is audible
    h.feed(silence(600));
    await h.conversation.idle();

    const turns = h.of("turn").map((t) => t.action);
    expect(turns).toEqual(["disclose", "ask", "ask"]); // no follow-up was ever sent
    expect(h.of("turn").at(-1)).toMatchObject({ questionId: "q2" });
    expect(h.of("transcript").at(-1)!.text).toBe("عادي بس لأنه قريب من البيت والأكل نظيف");
    expect(h.of("audio_cancel")).toHaveLength(0);
    // Only what was actually said is stored: no trace of the withdrawn follow-up.
    expect(h.stored.map((e) => e.action ?? e.role)).toEqual([
      "disclose",
      "participant",
      "ask",
      "participant",
      "ask",
    ]);
    expect(h.stored[3]).toMatchObject({
      text: "عادي بس لأنه قريب من البيت والأكل نظيف",
      asrConfidence: 0.9,
    });
    expect(h.consents).toHaveLength(1);

    // Each spoken answer carries its recording; the merged one holds both parts:
    // two utterances of (300 ms preroll-limited speech + 600 ms trailing silence).
    const consentAudio = h.recorded.get(h.stored[1]!)!;
    const mergedAudio = h.recorded.get(h.stored[3]!)!;
    expect(consentAudio).toBeGreaterThan(0);
    expect(mergedAudio).toBeGreaterThan(consentAudio * 1.5);
    expect([...h.recorded.keys()].every((e) => e.role === "participant")).toBe(true);
  });

  it("asks to repeat when recognition confidence is low", async () => {
    const h = await harness({ asr: [{ text: "همم", confidence: 0.2 }] });
    h.send(hello());
    await h.conversation.idle();
    h.heard();
    h.say(300);
    await h.conversation.idle();
    expect(h.of("turn").at(-1)).toMatchObject({ action: "repair" });
  });

  it("switches to text mode on request and stops listening to audio", async () => {
    const h = await harness();
    h.send(hello());
    await h.conversation.idle();
    h.heard();
    h.send({ type: "mode", mode: "text" });
    h.say(400);
    await h.conversation.idle();
    expect(h.of("vad")).toHaveLength(0);
    h.send({ type: "text", text: "إيه" });
    await h.conversation.idle();
    expect(h.of("turn").at(-1)).toMatchObject({ action: "ask" });
  });
});
