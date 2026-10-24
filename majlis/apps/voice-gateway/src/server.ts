import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import type { InterviewGuide } from "@majlis/interviewer";
import { createProviders, type ProviderSet } from "@majlis/providers";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { loadConfig, type GatewayConfig } from "./config.js";
import { Conversation } from "./conversation.js";
import { LatencyTracker } from "./latency.js";
import { demoGuide } from "./demo-guide.js";
import { InMemorySessionStore, type SessionSettings, type SessionStore } from "./sessions.js";
import { registerWhatsappWebhook, type WhatsappWebhookOptions } from "./whatsapp-webhook.js";

export interface GatewayOptions {
  /** Enables the WhatsApp webhook (needs the database). */
  whatsapp?: WhatsappWebhookOptions;
  providers?: ProviderSet;
  config?: Partial<GatewayConfig>;
  store?: SessionStore;
  logger?: boolean;
  /** Fixed interviewer seed (tests). */
  seed?: number;
}

/** Close codes sent to the browser. */
export const CLOSE = {
  consentRequired: 4401,
  forbidden: 4403,
  notFound: 4404,
  conflict: 4409,
} as const;

const MAX_FRAME_BYTES = 64 * 1024;

function tokenMatches(header: string | undefined, token: string): boolean {
  if (!token || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function originAllowed(req: FastifyRequest, allowed: string[]): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients (tests, server-to-server)
  if (allowed.length) return allowed.includes(origin);
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function emptyLatency() {
  return new LatencyTracker().summary();
}

export async function buildServer(options: GatewayOptions = {}): Promise<FastifyInstance> {
  const config: GatewayConfig = { ...loadConfig(), ...options.config };
  const providers = options.providers ?? createProviders();
  const store = options.store ?? new InMemorySessionStore();
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 256 * 1024 });
  await app.register(websocket, { options: { maxPayload: MAX_FRAME_BYTES } });

  app.get("/healthz", async () => ({
    status: "ok",
    providers: { asr: providers.asr.name, tts: providers.tts.name, llm: providers.llm.name },
  }));

  // ─── internal API (memory-backed deployments only; with a database the web app
  // creates sessions itself after recording consent) ──────────────────────────
  const internal = (req: FastifyRequest) =>
    tokenMatches(req.headers.authorization, config.internalToken);
  const createSession = store.create?.bind(store);

  if (createSession) {
    app.post<{ Body: { guide: InterviewGuide; settings?: SessionSettings } }>(
      "/v1/sessions",
      async (req, reply) => {
        if (!internal(req)) return reply.code(config.internalToken ? 401 : 404).send();
        try {
          const session = await createSession(req.body.guide, req.body.settings ?? {});
          return reply.code(201).send({
            id: session.id,
            streamPath: `/v1/sessions/${session.id}/stream`,
          });
        } catch (err) {
          return reply
            .code(400)
            .send({ error: err instanceof Error ? err.message : "invalid guide" });
        }
      },
    );
  }

  app.get<{ Params: { id: string } }>("/v1/sessions/:id", async (req, reply) => {
    if (!internal(req)) return reply.code(config.internalToken ? 401 : 404).send();
    const session = await store.get(req.params.id);
    if (!session) return reply.code(404).send();
    return { id: session.id, status: session.status };
  });

  // ─── participant stream ───────────────────────────────────────────────────
  app.get<{ Params: { sessionId: string } }>(
    "/v1/sessions/:sessionId/stream",
    { websocket: true },
    async (socket, req) => {
      // Listen before any await: the browser sends "hello" as soon as the socket
      // opens, and session lookup takes a database round trip.
      const early: { data: Buffer; isBinary: boolean }[] = [];
      let conversation: Conversation | null = null;
      const deliver = (data: Buffer, isBinary: boolean) => {
        if (!conversation) return void early.push({ data, isBinary });
        if (!isBinary) return conversation.handleText(data.toString("utf8"));
        if (data.byteLength % 2 !== 0) return;
        // Copy into an aligned buffer; ws payloads may start at odd offsets.
        const frame = new Int16Array(data.byteLength / 2);
        new Uint8Array(frame.buffer).set(data);
        conversation.handleAudio(frame);
      };
      socket.on("message", deliver);
      socket.on("close", () => conversation?.close());

      if (!originAllowed(req, config.allowedOrigins))
        return socket.close(CLOSE.forbidden, "origin");
      const session = await store.get(req.params.sessionId);
      if (!session) return socket.close(CLOSE.notFound, "unknown session");
      if (!session.hasConsent) return socket.close(CLOSE.consentRequired, "consent required");
      if (!(await store.claim(session.id)))
        return socket.close(CLOSE.conflict, "session already used");
      if (socket.readyState !== socket.OPEN) {
        // The participant left while we were looking the session up.
        return void store.finish(session.id, "abandoned", emptyLatency(), null);
      }

      conversation = new Conversation({
        session,
        providers,
        config,
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
        sendJson: (msg) => {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
        },
        sendAudio: (chunk) => {
          if (socket.readyState === socket.OPEN) socket.send(chunk, { binary: true });
        },
        persist: {
          turns: (entries, dialect, audioFor) =>
            store.appendTurns(session.id, entries, dialect, audioFor),
          consent: (record) => store.recordVerbalConsent(session.id, record),
        },
        onPersistError: (err) => req.log.error({ err }, "failed to store turns"),
        onEnd: (status, latency, dialect) => store.finish(session.id, status, latency, dialect),
      });
      for (const m of early.splice(0)) deliver(m.data, m.isBinary);
    },
  );

  if (options.whatsapp) await registerWhatsappWebhook(app, options.whatsapp);

  // ─── local development page ───────────────────────────────────────────────
  if (config.devPage && createSession) {
    const clientDir = dirname(fileURLToPath(import.meta.resolve("@majlis/voice-client")));
    await app.register(fastifyStatic, { root: clientDir, prefix: "/dev/client/" });
    const page = await readFile(new URL("../dev/index.html", import.meta.url), "utf8");
    app.get("/dev", async (_req, reply) => {
      const session = await createSession(demoGuide);
      return reply
        .type("text/html; charset=utf-8")
        .send(page.replace("__SESSION_ID__", session.id));
    });
  }

  return app;
}
