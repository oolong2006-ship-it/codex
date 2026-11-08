import { env } from "../env";

export type OutboundMessage = { to: string; body: string };
export type SendResult = { ok: boolean; ref?: string; error?: string };

export interface MessagingProvider {
  readonly name: "console" | "whatsapp";
  send(msg: OutboundMessage): Promise<SendResult>;
}

/** Development provider: prints the message instead of sending it. */
export class ConsoleMessagingProvider implements MessagingProvider {
  readonly name = "console" as const;
  readonly sent: OutboundMessage[] = [];
  async send(msg: OutboundMessage): Promise<SendResult> {
    this.sent.push(msg);
    console.log(`[messaging:console] to=${msg.to}\n${msg.body}`);
    return { ok: true, ref: `console-${this.sent.length}` };
  }
}

/**
 * WhatsApp Business Cloud API. Free-form text only reaches customers inside the
 * 24h service window; marketing outside it needs pre-approved templates
 * (see docs/ROADMAP.md). Kept minimal on purpose.
 */
export class WhatsAppMessagingProvider implements MessagingProvider {
  readonly name = "whatsapp" as const;
  constructor(
    private readonly phoneNumberId: string,
    private readonly token: string,
  ) {}
  async send(msg: OutboundMessage): Promise<SendResult> {
    const res = await fetch(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: msg.to.replace(/^\+/, ""), type: "text", text: { body: msg.body } }),
    });
    if (!res.ok) return { ok: false, error: `whatsapp ${res.status}` };
    const body = (await res.json()) as { messages?: Array<{ id: string }> };
    return { ok: true, ref: body.messages?.[0]?.id };
  }
}

const g = globalThis as unknown as { __khatmMessaging?: MessagingProvider };

export function messaging(): MessagingProvider {
  if (!g.__khatmMessaging) {
    const e = env();
    g.__khatmMessaging =
      e.MESSAGING_PROVIDER === "whatsapp" && e.WHATSAPP_PHONE_NUMBER_ID && e.WHATSAPP_ACCESS_TOKEN
        ? new WhatsAppMessagingProvider(e.WHATSAPP_PHONE_NUMBER_ID, e.WHATSAPP_ACCESS_TOKEN)
        : new ConsoleMessagingProvider();
  }
  return g.__khatmMessaging;
}

export function setMessagingProvider(p: MessagingProvider) {
  g.__khatmMessaging = p;
}
