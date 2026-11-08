import { z } from "zod";
import { one, tx } from "../db";
import { AppError } from "../errors";
import { normalizePhone } from "../phone";
import { rateLimit } from "../rate-limit";
import { enqueue, scheduleDrain } from "../outbox";
import { randomCode, randomSecret } from "../tokens";
import { env } from "../env";

export const enrollSchema = z.object({
  programSlug: z.string().trim().toLowerCase(),
  name: z.string().trim().min(2).max(60),
  phone: z.string().trim().min(1).max(25),
  consent: z.literal(true, { message: "errors.consentRequired" }),
  marketingOptIn: z.boolean().default(false),
});

export type EnrollResult =
  | { kind: "created"; serial: string; authToken: string }
  /** A card already exists for this number. We never reveal it here — the link is sent to the phone owner. */
  | { kind: "existing_sent" };

export type PublicProgram = {
  id: string;
  slug: string;
  name: string;
  merchantName: string;
  stampsRequired: number;
  rewardDescription: string;
  welcomeStamps: number;
  terms: string | null;
  design: unknown;
  active: boolean;
};

export async function publicProgram(slug: string): Promise<PublicProgram | null> {
  return one<PublicProgram>(
    `SELECT p.id, p.slug, p.name, m.name AS "merchantName", p.stamps_required AS "stampsRequired",
            p.reward_description AS "rewardDescription", p.welcome_stamps AS "welcomeStamps", p.terms, p.design, p.active
     FROM loyalty_programs p JOIN merchants m ON m.id = p.merchant_id WHERE p.slug = $1`,
    [slug.toLowerCase()],
  );
}

export async function enroll(input: z.input<typeof enrollSchema>, ip: string): Promise<EnrollResult> {
  const parsed = enrollSchema.safeParse(input);
  if (!parsed.success) {
    const consent = parsed.error.issues.some((i) => i.path[0] === "consent");
    throw new AppError(consent ? "errors.consentRequired" : "errors.invalidInput");
  }
  const data = parsed.data;
  const phone = normalizePhone(data.phone);
  if (!phone) throw new AppError("errors.invalidPhone");
  await rateLimit(`enroll:ip:${ip}`, 20, 600);
  await rateLimit(`enroll:phone:${phone}`, 5, 3600);

  return tx(async (db, onCommit) => {
    const program = await one<{ id: string; merchant_id: string; active: boolean; welcome_stamps: number; stamps_required: number; merchant_name: string }>(
      `SELECT p.id, p.merchant_id, p.active, p.welcome_stamps, p.stamps_required, m.name AS merchant_name
       FROM loyalty_programs p JOIN merchants m ON m.id = p.merchant_id WHERE p.slug = $1`,
      [data.programSlug],
      db,
    );
    if (!program) throw new AppError("errors.notFound", 404);
    if (!program.active) throw new AppError("errors.programInactive");

    const customer = await one<{ id: string }>(
      `INSERT INTO customers(merchant_id, name, phone, consent_at, marketing_opt_in)
       VALUES ($1,$2,$3, now(), $4)
       ON CONFLICT (merchant_id, phone) DO UPDATE
         SET marketing_opt_in = customers.marketing_opt_in OR EXCLUDED.marketing_opt_in
       RETURNING id`,
      [program.merchant_id, data.name, phone, data.marketingOptIn],
      db,
    );

    const existing = await one<{ serial_number: string; auth_token: string }>(
      `SELECT serial_number, auth_token FROM cards WHERE program_id = $1 AND customer_id = $2 AND status = 'ACTIVE'`,
      [program.id, customer!.id],
      db,
    );
    if (existing) {
      const link = `${env().APP_URL}/c/${existing.serial_number}?k=${encodeURIComponent(existing.auth_token)}`;
      await enqueue(db, "message.send", {
        to: phone,
        body: `بطاقة ولاء ${program.merchant_name}:\n${link}`,
      });
      onCommit(scheduleDrain);
      return { kind: "existing_sent" } as const;
    }

    const serial = randomCode(16);
    const authToken = randomSecret(24);
    const welcome = Math.min(program.welcome_stamps, program.stamps_required - 1);
    const card = await one<{ id: string }>(
      `INSERT INTO cards(merchant_id, program_id, customer_id, serial_number, auth_token, current_stamps, total_stamps, last_stamp_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6, NULL) RETURNING id`,
      [program.merchant_id, program.id, customer!.id, serial, authToken, welcome],
      db,
    );
    if (welcome > 0) {
      await db.query(
        `INSERT INTO stamp_events(merchant_id, card_id, quantity, source) VALUES ($1,$2,$3,'WELCOME')`,
        [program.merchant_id, card!.id, welcome],
      );
    }
    return { kind: "created", serial, authToken } as const;
  });
}
