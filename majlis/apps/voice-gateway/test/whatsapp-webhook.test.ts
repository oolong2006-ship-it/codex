import { createHmac } from "node:crypto";
import { jobs, whatsappContacts, type DbHandle } from "@majlis/db";
import { isolatedTestDb } from "@majlis/db/testing";
import { WhatsAppCloudProvider } from "@majlis/providers";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

const URL_TEST = process.env.DATABASE_URL_TEST;
const SECRET = "app-secret-for-tests";
const keys = {
  encryptionKey: Buffer.alloc(32, 9).toString("base64"),
  hashPepper: "pepper-for-tests-only",
};

const body = (id: string, text: string) =>
  JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id,
                  from: "966551234567",
                  timestamp: "1792832400",
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  });
const sign = (raw: string) => `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;

describe.skipIf(!URL_TEST)("WhatsApp webhook", () => {
  let h: DbHandle;
  let app: FastifyInstance;

  beforeAll(async () => {
    h = await isolatedTestDb(URL_TEST!, "wa_webhook");
    app = await buildServer({
      whatsapp: {
        db: h.db,
        provider: new WhatsAppCloudProvider({
          phoneNumberId: "1",
          accessToken: "x",
          appSecret: SECRET,
        }),
        keys,
        verifyToken: "verify-me",
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await h?.close();
  });

  const post = (raw: string, signature?: string) =>
    app.inject({
      method: "POST",
      url: "/v1/whatsapp/webhook",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "x-hub-signature-256": signature } : {}),
      },
      payload: raw,
    });

  it("answers Meta's verification only with the right token", async () => {
    const ok = await app.inject({
      url: "/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42",
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("42");
    const bad = await app.inject({
      url: "/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42",
    });
    expect(bad.statusCode).toBe(403);
  });

  it("rejects unsigned or tampered payloads without storing anything", async () => {
    const raw = body("w1", "هلا");
    expect((await post(raw)).statusCode).toBe(401);
    expect((await post(body("w1", "تلاعب"), sign(raw))).statusCode).toBe(401);
    expect(await h.db.select().from(jobs)).toEqual([]);
    expect(await h.db.select().from(whatsappContacts)).toEqual([]);
  });

  it("stores the number encrypted and queues each message once", async () => {
    const raw = body("w2", "هلا");
    expect((await post(raw, sign(raw))).statusCode).toBe(200);
    expect((await post(raw, sign(raw))).statusCode).toBe(200); // Meta retries deliveries
    const queued = await h.db.select().from(jobs).where(eq(jobs.kind, "whatsapp-inbound"));
    expect(queued).toHaveLength(1);
    const [contact] = await h.db.select().from(whatsappContacts);
    expect(JSON.stringify(contact)).not.toContain("966551234567");
    expect(JSON.stringify(queued[0]!.payload)).not.toContain("966551234567");
    expect(queued[0]).toMatchObject({ serialKey: `wa:${contact!.id}`, dedupeKey: "wa:w2" });
  });
});
