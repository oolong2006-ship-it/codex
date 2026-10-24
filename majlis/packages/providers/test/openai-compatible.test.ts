import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  OpenAiCompatibleAsr,
  OpenAiCompatibleEmbeddings,
  OpenAiCompatibleLlm,
  OpenAiCompatibleTts,
  pcmToWav,
} from "../src/index.js";

const seen: { path: string; auth?: string; body: Buffer }[] = [];
let server: Server;
let base = "";

const read = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => parts.push(c));
    req.on("end", () => resolve(Buffer.concat(parts)));
  });

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const body = await read(req);
    seen.push({
      path: req.url ?? "",
      body,
      ...(req.headers.authorization ? { auth: req.headers.authorization } : {}),
    });
    if (req.url === "/v1/audio/transcriptions") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ text: " هلا والله ", segments: [{ avg_logprob: Math.log(0.8) }] }));
    } else if (req.url === "/v1/audio/speech") {
      res.write(Buffer.alloc(640, 1));
      res.end(Buffer.alloc(640, 2));
    } else if (req.url === "/v1/embeddings") {
      const input = (JSON.parse(body.toString()) as { input: string[] }).input;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          data: input
            .map((_, i) => ({ index: i, embedding: Array.from({ length: 1024 }, () => 2) }))
            .reverse(),
        }),
      );
    } else if (req.url === "/v1/chat/completions") {
      res.setHeader("Content-Type", "text/event-stream");
      for (const t of ["إيه، ", "فاهم ", "عليك."]) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
      }
      res.end("data: [DONE]\n\n");
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const format = { encoding: "pcm_s16le" as const, sampleRateHz: 16000, channels: 1 as const };

describe("openai-compatible adapters", () => {
  it("transcribes buffered stream audio as a WAV upload", async () => {
    const asr = new OpenAiCompatibleAsr({ baseUrl: base, model: "whisper", apiKey: "k" });
    const stream = asr.startStream({ language: "ar-SA", format });
    stream.write(new Uint8Array(320));
    stream.write(new Uint8Array(320));
    stream.end();
    const events = [];
    for await (const e of stream) events.push(e);
    const final = events.find((e) => e.type === "final");
    expect(final).toMatchObject({ text: "هلا والله" });
    expect((final as { confidence: number }).confidence).toBeCloseTo(0.8);
    const req = seen.find((s) => s.path === "/v1/audio/transcriptions")!;
    expect(req.auth).toBe("Bearer k");
    expect(req.body.includes(Buffer.from("RIFF"))).toBe(true);
  });

  it("streams synthesized PCM", async () => {
    const tts = new OpenAiCompatibleTts({
      baseUrl: base,
      model: "tts",
      voices: { male: "m", female: "f" },
    });
    let bytes = 0;
    for await (const chunk of tts.synthesize({ text: "هلا", voiceGender: "female", format })) {
      bytes += chunk.byteLength;
    }
    expect(bytes).toBe(1280);
    const req = seen.find((s) => s.path === "/v1/audio/speech")!;
    expect(JSON.parse(req.body.toString())).toMatchObject({ voice: "f", response_format: "pcm" });
  });

  it("streams chat deltas", async () => {
    const llm = new OpenAiCompatibleLlm({ baseUrl: base, model: "allam" });
    expect(await llm.complete({ messages: [{ role: "user", content: "هلا" }] })).toBe(
      "إيه، فاهم عليك.",
    );
  });

  it("embeds in input order, normalized, and checks the dimension", async () => {
    const emb = new OpenAiCompatibleEmbeddings({
      baseUrl: base,
      model: "bge-m3",
      dimensions: 1024,
    });
    const vectors = await emb.embed(["أ", "ب"], "query");
    expect(vectors).toHaveLength(2);
    expect(Math.hypot(...vectors[0]!)).toBeCloseTo(1);
    const wrong = new OpenAiCompatibleEmbeddings({ baseUrl: base, model: "x", dimensions: 768 });
    await expect(wrong.embed(["أ"], "document")).rejects.toThrow(/768/);
  });

  it("builds a valid WAV header", () => {
    const wav = pcmToWav(new Uint8Array(100), 16000);
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(100);
  });
});
