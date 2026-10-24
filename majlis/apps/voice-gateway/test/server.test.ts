import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";

describe("voice-gateway", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it("reports health with configured providers", async () => {
    app = await buildServer();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "ok",
      providers: { asr: "mock", tts: "mock", llm: "mock" },
    });
  });
});
