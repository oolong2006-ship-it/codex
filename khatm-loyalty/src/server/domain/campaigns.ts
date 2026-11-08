import { z } from "zod";
import { one, q, tx } from "../db";
import { AppError } from "../errors";
import { requirePermission, type Actor } from "../actor";
import { PERMISSIONS } from "../rbac";
import { audit } from "../audit";
import { enqueue, scheduleDrain } from "../outbox";
import { rateLimit } from "../rate-limit";
import { atRiskCustomers } from "./analytics";

/**
 * Campaign templates for Saudi occasions. Stored as data so new occasions can
 * be added (or moved to the database) without code changes in the UI.
 */
export const CAMPAIGN_TEMPLATES = [
  {
    key: "winback",
    name: { ar: "استرجاع عميل منقطع", en: "Win-back" },
    message: "هلا {name} 👋 وحشتنا في {business}! قهوتك الجاية علينا بختم إضافي هالأسبوع ☕",
    suggestedAudience: "AT_RISK",
  },
  {
    key: "reward_reminder",
    name: { ar: "تذكير بمكافأة جاهزة", en: "Reward reminder" },
    message: "{name}، عندك مكافأة جاهزة في {business} 🎁 مرّنا واستلمها!",
    suggestedAudience: "REWARD_READY",
  },
  {
    key: "ramadan",
    name: { ar: "رمضان", en: "Ramadan" },
    message: "رمضان كريم {name} 🌙 من {business}: ختم مضاعف بعد الإفطار طوال الشهر.",
    suggestedAudience: "ALL",
  },
  {
    key: "eid",
    name: { ar: "العيد", en: "Eid" },
    message: "كل عام وأنت بخير {name} 🎉 عيدك مبارك من {business} — هديتك ختم إضافي مع أول زيارة بالعيد.",
    suggestedAudience: "ALL",
  },
  {
    key: "national_day",
    name: { ar: "اليوم الوطني (٢٣ سبتمبر)", en: "Saudi National Day (Sep 23)" },
    message: "دام عزك يا وطن 💚 {name}، احتفل معنا في {business}: ختمين بدل ختم يوم ٢٣ سبتمبر.",
    suggestedAudience: "ALL",
  },
  {
    key: "founding_day",
    name: { ar: "يوم التأسيس (٢٢ فبراير)", en: "Founding Day (Feb 22)" },
    message: "يوم بدينا 🇸🇦 {name}، بمناسبة يوم التأسيس عندنا في {business} مفاجأة لأعضاء البطاقة.",
    suggestedAudience: "ALL",
  },
] as const;

export const AUDIENCES = ["ALL", "AT_RISK", "REWARD_READY"] as const;

export const campaignSchema = z.object({
  templateKey: z.enum(CAMPAIGN_TEMPLATES.map((t) => t.key) as [string, ...string[]]),
  audience: z.enum(AUDIENCES),
  message: z.string().trim().min(5).max(600),
});

export function personalize(template: string, vars: { name: string; business: string }) {
  return template.replaceAll("{name}", vars.name.split(/\s+/)[0] ?? vars.name).replaceAll("{business}", vars.business);
}

async function audience(actor: Actor, a: (typeof AUDIENCES)[number]) {
  if (a === "AT_RISK") {
    return (await atRiskCustomers(actor, 500)).filter((c) => c.marketingOptIn).map((c) => ({ id: c.customerId, name: c.name, phone: c.phone }));
  }
  if (a === "REWARD_READY") {
    return q<{ id: string; name: string; phone: string }>(
      `SELECT DISTINCT cu.id, cu.name, cu.phone FROM customers cu JOIN cards c ON c.customer_id = cu.id
       WHERE cu.merchant_id = $1 AND cu.marketing_opt_in AND c.status = 'ACTIVE' AND c.rewards_available > 0`,
      [actor.merchantId],
    );
  }
  return q<{ id: string; name: string; phone: string }>(`SELECT id, name, phone FROM customers WHERE merchant_id = $1 AND marketing_opt_in`, [actor.merchantId]);
}

export async function audienceSize(actor: Actor, a: (typeof AUDIENCES)[number]) {
  requirePermission(actor, PERMISSIONS.CAMPAIGN_SEND);
  return (await audience(actor, a)).length;
}

export async function sendCampaign(actor: Actor, input: z.input<typeof campaignSchema>): Promise<number> {
  requirePermission(actor, PERMISSIONS.CAMPAIGN_SEND);
  const d = campaignSchema.parse(input);
  await rateLimit(`campaign:${actor.merchantId}`, 10, 86400);
  const recipients = await audience(actor, d.audience);
  const merchant = await one<{ name: string }>(`SELECT name FROM merchants WHERE id = $1`, [actor.merchantId]);
  return tx(async (db, onCommit) => {
    const c = await one<{ id: string }>(
      `INSERT INTO campaigns(merchant_id, template_key, audience, message, recipients, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [actor.merchantId, d.templateKey, d.audience, d.message, recipients.length, actor.staffUserId],
      db,
    );
    for (const r of recipients) {
      const log = await one<{ id: string }>(
        `INSERT INTO message_log(merchant_id, campaign_id, customer_id, channel, status) VALUES ($1,$2,$3,'whatsapp','QUEUED') RETURNING id`,
        [actor.merchantId, c!.id, r.id],
        db,
      );
      await enqueue(db, "message.send", { to: r.phone, body: personalize(d.message, { name: r.name, business: merchant!.name }), logId: log!.id });
    }
    await audit(db, actor, "campaign.send", "campaign", c!.id, { audience: d.audience, recipients: recipients.length });
    onCommit(scheduleDrain);
    return recipients.length;
  });
}

export async function listCampaigns(actor: Actor) {
  requirePermission(actor, PERMISSIONS.CAMPAIGN_SEND);
  return q<{ id: string; template_key: string; audience: string; recipients: number; created_at: Date; sent: number }>(
    `SELECT c.id, c.template_key, c.audience, c.recipients, c.created_at,
            (SELECT count(*)::int FROM message_log l WHERE l.campaign_id = c.id AND l.status = 'SENT') AS sent
     FROM campaigns c WHERE c.merchant_id = $1 ORDER BY c.created_at DESC LIMIT 50`,
    [actor.merchantId],
  );
}

export function assertTemplate(key: string) {
  const t = CAMPAIGN_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new AppError("errors.notFound", 404);
  return t;
}
