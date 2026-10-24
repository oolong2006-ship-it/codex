import { createHmac, timingSafeEqual } from "node:crypto";
import type { WhatsAppInboundMessage, WhatsAppProvider } from "../types.js";

/**
 * WhatsApp Business Cloud API. Messages necessarily transit Meta's servers,
 * outside the Kingdom, so this adapter only starts with an explicit, recorded
 * approval (see registry). participantRef here is the phone number in
 * international digits; callers resolve it from the encrypted contact record.
 */
export interface WhatsAppCloudConfig {
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  apiBase?: string;
  apiVersion?: string;
}

interface WebhookBody {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body?: string };
          audio?: { id?: string };
        }[];
      };
    }[];
  }[];
}

export class WhatsAppCloudProvider implements WhatsAppProvider {
  readonly name = "cloud-api";
  constructor(private readonly cfg: WhatsAppCloudConfig) {}

  private url(path: string): string {
    return `${(this.cfg.apiBase ?? "https://graph.facebook.com").replace(/\/+$/, "")}/${this.cfg.apiVersion ?? "v21.0"}/${path}`;
  }

  private async call(path: string, init: RequestInit): Promise<Response> {
    const res = await fetch(this.url(path), {
      ...init,
      headers: { Authorization: `Bearer ${this.cfg.accessToken}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`WhatsApp API ${path} failed: HTTP ${res.status}`);
    return res;
  }

  async sendText(participantRef: string, text: string) {
    const res = await this.call(`${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: participantRef,
        type: "text",
        text: { body: text },
      }),
    });
    const body = (await res.json()) as { messages?: { id: string }[] };
    return { messageId: body.messages?.[0]?.id ?? "" };
  }

  /** Voice notes must be OGG/Opus. */
  async sendVoiceNote(participantRef: string, audio: Uint8Array) {
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", "audio/ogg");
    form.set("file", new Blob([audio], { type: "audio/ogg" }), "reply.ogg");
    const upload = (await (
      await this.call(`${this.cfg.phoneNumberId}/media`, { method: "POST", body: form })
    ).json()) as { id: string };
    const res = await this.call(`${this.cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: participantRef,
        type: "audio",
        audio: { id: upload.id },
      }),
    });
    const body = (await res.json()) as { messages?: { id: string }[] };
    return { messageId: body.messages?.[0]?.id ?? "" };
  }

  async downloadMedia(mediaId: string): Promise<Uint8Array> {
    const meta = (await (await this.call(mediaId, { method: "GET" })).json()) as { url: string };
    const res = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${this.cfg.accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`WhatsApp media download failed: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Rejects any payload whose X-Hub-Signature-256 does not match the app secret. */
  parseWebhook(rawBody: string, signature: string | undefined): WhatsAppInboundMessage[] {
    const expected = `sha256=${createHmac("sha256", this.cfg.appSecret).update(rawBody).digest("hex")}`;
    const given = Buffer.from(signature ?? "");
    if (given.length !== expected.length || !timingSafeEqual(given, Buffer.from(expected))) {
      throw new Error("invalid webhook signature");
    }
    const body = JSON.parse(rawBody) as WebhookBody;
    const out: WhatsAppInboundMessage[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const m of change.value?.messages ?? []) {
          if (m.type === "text" && m.text?.body) {
            out.push({
              messageId: m.id,
              participantRef: m.from,
              receivedAt: new Date(Number(m.timestamp) * 1000),
              kind: "text",
              text: m.text.body,
            });
          } else if (m.type === "audio" && m.audio?.id) {
            out.push({
              messageId: m.id,
              participantRef: m.from,
              receivedAt: new Date(Number(m.timestamp) * 1000),
              kind: "audio",
              mediaId: m.audio.id,
            });
          }
        }
      }
    }
    return out;
  }
}
