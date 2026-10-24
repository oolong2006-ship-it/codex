import { enqueueJob, upsertContact, type Db, type PiiKeys } from "@majlis/db";
import type { WhatsAppProvider } from "@majlis/providers";
import type { FastifyInstance } from "fastify";

export interface WhatsappWebhookOptions {
  db: Db;
  provider: WhatsAppProvider;
  keys: PiiKeys;
  /** Token Meta echoes during webhook verification. */
  verifyToken: string;
}

/**
 * Receives WhatsApp messages. The phone number is stored encrypted at once and
 * only an opaque contact id goes into the job queue; processing (ASR, the
 * interviewer, replies) happens in the worker, one message at a time per contact.
 */
export async function registerWhatsappWebhook(app: FastifyInstance, opts: WhatsappWebhookOptions) {
  await app.register(async (scope) => {
    // The signature covers the exact bytes, so the body is kept as a string.
    scope.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) =>
      done(null, body),
    );

    scope.get<{ Querystring: Record<string, string> }>(
      "/v1/whatsapp/webhook",
      async (req, reply) => {
        const q = req.query;
        if (
          q["hub.mode"] === "subscribe" &&
          opts.verifyToken &&
          q["hub.verify_token"] === opts.verifyToken
        ) {
          return reply.type("text/plain").send(q["hub.challenge"] ?? "");
        }
        return reply.code(403).send();
      },
    );

    scope.post("/v1/whatsapp/webhook", async (req, reply) => {
      const raw = typeof req.body === "string" ? req.body : "";
      let messages;
      try {
        messages = opts.provider.parseWebhook(
          raw,
          req.headers["x-hub-signature-256"] as string | undefined,
        );
      } catch {
        return reply.code(401).send();
      }
      for (const m of messages) {
        const contactId = await upsertContact(opts.db, m.participantRef, opts.keys);
        await enqueueJob(
          opts.db,
          "whatsapp-inbound",
          {
            contactId,
            message: {
              messageId: m.messageId,
              kind: m.kind,
              ...(m.text ? { text: m.text } : {}),
              ...(m.mediaId ? { mediaId: m.mediaId } : {}),
            },
          },
          { dedupeKey: `wa:${m.messageId}`, serialKey: `wa:${contactId}`, once: true },
        );
      }
      return reply.code(200).send({ received: messages.length });
    });
  });
}
