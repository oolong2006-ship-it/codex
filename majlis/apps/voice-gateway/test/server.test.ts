import type { AddressInfo } from "node:net";
import type { ServerMessage } from "@majlis/voice-client/protocol";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { demoGuide } from "../src/demo-guide.js";
import { CLOSE, buildServer } from "../src/server.js";

const TOKEN = "test-internal-token";
let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(config: Record<string, unknown> = {}) {
  app = await buildServer({ config: { internalToken: TOKEN, ...config }, seed: 1 });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as AddressInfo;
  return { http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}` };
}

async function createSession(http: string, token = TOKEN) {
  return fetch(`${http}/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ guide: demoGuide }),
  });
}

function connect(url: string, headers: Record<string, string> = {}) {
  const ws = new WebSocket(url, { headers });
  const messages: ServerMessage[] = [];
  const closed = new Promise<number>((resolve) => ws.on("close", (code) => resolve(code)));
  ws.on("message", (data, isBinary) => {
    if (!isBinary) messages.push(JSON.parse(data.toString()) as ServerMessage);
  });
  const opened = new Promise<void>((resolve) => ws.on("open", () => resolve()));
  const next = async (type: ServerMessage["type"], count = 1) => {
    const start = Date.now();
    while (messages.filter((m) => m.type === type).length < count) {
      if (Date.now() - start > 3000) throw new Error(`no ${type}`);
      await new Promise((r) => setTimeout(r, 5));
    }
    return messages.filter((m) => m.type === type).at(count - 1)!;
  };
  return { ws, messages, closed, opened, next };
}

describe("voice gateway server", () => {
  it("reports health with configured providers", async () => {
    const { http } = await start();
    const res = await fetch(`${http}/healthz`);
    expect(await res.json()).toEqual({
      status: "ok",
      providers: { asr: "mock", tts: "mock", llm: "mock" },
    });
  });

  it("protects the internal session API", async () => {
    const { http } = await start();
    expect((await createSession(http, "wrong")).status).toBe(401);
    const res = await createSession(http);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; streamPath: string };
    expect(body.id).toMatch(/^[\w-]{24}$/);
    expect(body.streamPath).toBe(`/v1/sessions/${body.id}/stream`);
  });

  it("hides the internal API entirely when no token is configured", async () => {
    const { http } = await start({ internalToken: "" });
    expect((await createSession(http, "")).status).toBe(404);
  });

  it("rejects unknown sessions, foreign origins and reuse", async () => {
    const { http, ws } = await start();
    expect(await connect(`${ws}/v1/sessions/nope/stream`).closed).toBe(CLOSE.notFound);

    const { id } = (await (await createSession(http)).json()) as { id: string };
    const foreign = connect(`${ws}/v1/sessions/${id}/stream`, { Origin: "https://evil.example" });
    expect(await foreign.closed).toBe(CLOSE.forbidden);

    const first = connect(`${ws}/v1/sessions/${id}/stream`);
    await first.opened;
    await new Promise((r) => setTimeout(r, 50));
    expect(await connect(`${ws}/v1/sessions/${id}/stream`).closed).toBe(CLOSE.conflict);
    first.ws.close();
  });

  it("runs a typed interview over the socket and stores the outcome", async () => {
    const { http, ws } = await start();
    const { id } = (await (await createSession(http)).json()) as { id: string };
    const client = connect(`${ws}/v1/sessions/${id}/stream`);
    await client.opened;
    client.ws.send(
      JSON.stringify({ type: "hello", protocol: 1, mode: "text", voiceGender: "male" }),
    );
    expect(await client.next("turn")).toMatchObject({ action: "disclose" });

    const answers = [
      "إيه",
      "اخترته لأنه قريب من البيت وأكله نظيف",
      "الطلب كان سريع والاستلام من السيارة سهل",
      "أوسّع الجلسات العائلية وأخلي الإضاءة أهدى",
    ];
    for (const [i, text] of answers.entries()) {
      client.ws.send(JSON.stringify({ type: "text", text }));
      await client.next("turn", i + 2);
    }
    expect(await client.next("ended")).toMatchObject({ reason: "completed" });
    client.ws.close();
    await client.closed;

    const status = await fetch(`${http}/v1/sessions/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(await status.json()).toMatchObject({ status: "completed" });
  });

  it("streams spoken replies as binary audio", async () => {
    const { http, ws } = await start();
    const { id } = (await (await createSession(http)).json()) as { id: string };
    const client = connect(`${ws}/v1/sessions/${id}/stream`);
    let audioBytes = 0;
    client.ws.on("message", (data: Buffer, isBinary) => {
      if (isBinary) audioBytes += data.byteLength;
    });
    await client.opened;
    client.ws.send(
      JSON.stringify({ type: "hello", protocol: 1, mode: "voice", voiceGender: "female" }),
    );
    const audioStart = await client.next("audio_start");
    expect(audioStart).toMatchObject({ sampleRate: 24000, encoding: "pcm_s16le" });
    await client.next("audio_end");
    expect(audioBytes).toBeGreaterThan(24000); // over half a second of speech
    client.ws.close();
  });
});
