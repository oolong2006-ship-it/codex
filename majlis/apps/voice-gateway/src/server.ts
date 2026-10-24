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
import { demoGuide } from "./demo-guide.js";
import { InMemorySessionStore, type SessionSettings, type SessionStore } from "./sessions.js";

export interface GatewayOptions {
  providers?: ProviderSet;
  config?: Partial<GatewayConfig>;
  store?: SessionStore;
  logger?: boolean;
  /** Fixed interviewer seed (tests). */
  seed?: number;
}

/** Close codes sent to the browser. */
export const CLOSE = { forbidden: 4403, notFound: 4404, conflict: 4409 } as const;

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

  // ─── internal API (called by the web app's server, never by browsers) ──────
  const internal = async (req: FastifyRequest) =>
    tokenMatches(req.headers.authorization, config.internalToken);

  app.post<{ Body: { guide: InterviewGuide; settings?: SessionSettings } }>(
    "/v1/sessions",
    async (req, reply) => {
      if (!(await internal(req))) return reply.code(config.internalToken ? 401 : 404).send();
      try {
        const session = await store.create(req.body.guide, req.body.settings ?? {});
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

  app.get<{ Params: { id: string } }>("/v1/sessions/:id", async (req, reply) => {
    if (!(await internal(req))) return reply.code(config.internalToken ? 401 : 404).send();
    const session = await store.get(req.params.id);
    if (!session) return reply.code(404).send();
    return { id: session.id, status: session.status, latency: session.latency ?? null };
  });

  // ─── participant stream ───────────────────────────────────────────────────
  app.get<{ Params: { sessionId: string } }>(
    "/v1/sessions/:sessionId/stream",
    { websocket: true },
    async (socket, req) => {
      if (!originAllowed(req, config.allowedOrigins))
        return socket.close(CLOSE.forbidden, "origin");
      const session = await store.get(req.params.sessionId);
      if (!session) return socket.close(CLOSE.notFound, "unknown session");
      if (session.status !== "created") return socket.close(CLOSE.conflict, "session already used");
      await store.update(session.id, { status: "active" });

      const conversation = new Conversation({
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
        onEnd: (status, latency) => {
          void store.update(session.id, { status, latency });
        },
      });

      socket.on("message", (data: Buffer, isBinary: boolean) => {
        if (!isBinary) return conversation.handleText(data.toString("utf8"));
        if (data.byteLength % 2 !== 0) return;
        // Copy into an aligned buffer; ws payloads may start at odd offsets.
        const frame = new Int16Array(data.byteLength / 2);
        new Uint8Array(frame.buffer).set(data);
        conversation.handleAudio(frame);
      });
      socket.on("close", () => conversation.close());
    },
  );

  // ─── local development page ───────────────────────────────────────────────
  if (config.devPage) {
    const clientDir = dirname(fileURLToPath(import.meta.resolve("@majlis/voice-client")));
    await app.register(fastifyStatic, { root: clientDir, prefix: "/dev/client/" });
    const page = await readFile(new URL("../dev/index.html", import.meta.url), "utf8");
    app.get("/dev", async (_req, reply) => {
      const session = await store.create(demoGuide);
      return reply
        .type("text/html; charset=utf-8")
        .send(page.replace("__SESSION_ID__", session.id));
    });
  }

  return app;
}
