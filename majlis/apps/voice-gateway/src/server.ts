import websocket from "@fastify/websocket";
import { createProviders, type ProviderSet } from "@majlis/providers";
import Fastify, { type FastifyInstance } from "fastify";

export interface GatewayOptions {
  providers?: ProviderSet;
  logger?: boolean;
}

export async function buildServer(options: GatewayOptions = {}): Promise<FastifyInstance> {
  const providers = options.providers ?? createProviders();
  const app = Fastify({ logger: options.logger ?? false });
  await app.register(websocket);

  app.get("/healthz", async () => ({
    status: "ok",
    providers: {
      asr: providers.asr.name,
      tts: providers.tts.name,
      llm: providers.llm.name,
    },
  }));

  // Realtime interview channel; the full pipeline (VAD, barge-in, latency stats) lands in phase 3.
  app.get("/v1/sessions/:sessionId/stream", { websocket: true }, (socket) => {
    socket.send(JSON.stringify({ type: "not_implemented", phase: 3 }));
    socket.close(1013, "not implemented");
  });

  return app;
}
