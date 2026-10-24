import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProviderConfigError, WhatsAppCloudProvider, createProviders } from "../src/index.js";

const SECRET = "app-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
const calls: { method: string; url: string; body: string }[] = [];
let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => parts.push(c));
    req.on("end", () => {
      calls.push({
        method: req.method!,
        url: req.url!,
        body: Buffer.concat(parts).toString("latin1"),
      });
      res.setHeader("Content-Type", "application/json");
      if (req.url!.endsWith("/media")) return res.end(JSON.stringify({ id: "media-1" }));
      if (req.url!.endsWith("/messages"))
        return res.end(JSON.stringify({ messages: [{ id: "wamid.1" }] }));
      if (req.url!.endsWith("/v21.0/media-9"))
        return res.end(JSON.stringify({ url: `${base}/files/media-9` }));
      if (req.url === "/files/media-9") return res.end(Buffer.from("OggS-audio"));
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const provider = () =>
  new WhatsAppCloudProvider({
    phoneNumberId: "123",
    accessToken: "tok",
    appSecret: SECRET,
    apiBase: base,
  });

describe("WhatsAppCloudProvider", () => {
  it("parses text and voice messages from a correctly signed webhook", () => {
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "m1",
                    from: "966551234567",
                    timestamp: "1761300000",
                    type: "text",
                    text: { body: "مجلس abc123XYZ" },
                  },
                  {
                    id: "m2",
                    from: "966551234567",
                    timestamp: "1761300060",
                    type: "audio",
                    audio: { id: "media-9" },
                  },
                  { id: "m3", from: "966551234567", timestamp: "1761300070", type: "sticker" },
                ],
              },
            },
          ],
        },
      ],
    });
    const msgs = provider().parseWebhook(body, sign(body));
    expect(msgs.map((m) => [m.kind, m.text ?? m.mediaId])).toEqual([
      ["text", "مجلس abc123XYZ"],
      ["audio", "media-9"],
    ]);
  });

  it("rejects unsigned or forged webhooks", () => {
    const body = JSON.stringify({ entry: [] });
    expect(() => provider().parseWebhook(body, undefined)).toThrow(/signature/);
    expect(() => provider().parseWebhook(body, sign(body + "x"))).toThrow(/signature/);
  });

  it("sends text, uploads voice notes and downloads media", async () => {
    const p = provider();
    expect(await p.sendText("966551234567", "هلا")).toEqual({ messageId: "wamid.1" });
    await p.sendVoiceNote("966551234567", new Uint8Array([1, 2, 3]));
    expect(calls.some((c) => c.url === "/v21.0/123/media")).toBe(true);
    expect(calls.at(-1)!.body).toContain('"audio":{"id":"media-1"}');
    expect(Buffer.from(await p.downloadMedia("media-9")).toString()).toBe("OggS-audio");
  });

  it("refuses to start without an explicit cross-border approval", () => {
    const env = {
      WHATSAPP_PROVIDER: "cloud-api",
      WHATSAPP_PHONE_NUMBER_ID: "1",
      WHATSAPP_API_TOKEN: "t",
      WHATSAPP_APP_SECRET: "s",
    };
    expect(() => createProviders(env)).toThrow(ProviderConfigError);
    expect(() => createProviders(env)).toThrow(/outside the Kingdom/);
    expect(createProviders({ ...env, WHATSAPP_CROSS_BORDER_APPROVED: "true" }).whatsapp.name).toBe(
      "cloud-api",
    );
  });
});
