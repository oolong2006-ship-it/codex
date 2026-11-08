import { z } from "zod";
import { one, tx, type Db } from "../db";
import { AppError } from "../errors";
import { requirePermission, type Actor } from "../actor";
import { PERMISSIONS } from "../rbac";
import { verifyCardToken } from "../tokens";
import { normalizePhone, maskPhone } from "../phone";
import { enqueue, scheduleDrain } from "../outbox";
import { rateLimit } from "../rate-limit";
import { audit } from "../audit";

/** Card state shown on the cashier screen. Never exposes the full phone number. */
export type CardSummary = {
  serial: string;
  customerName: string;
  phoneMasked: string;
  currentStamps: number;
  stampsRequired: number;
  rewardsAvailable: number;
  rewardDescription: string;
  maxStampsPerScan: number;
  lastStampAt: string | null;
  cooldownRemainingMinutes: number;
};

type CardRow = {
  id: string;
  serial_number: string;
  status: "ACTIVE" | "VOID";
  current_stamps: number;
  rewards_available: number;
  cycles_completed: number;
  last_stamp_at: Date | null;
  customer_name: string;
  phone: string;
  stamps_required: number;
  reward_description: string;
  cooldown_minutes: number;
  max_stamps_per_scan: number;
  program_active: boolean;
};

const CARD_SQL = `
  SELECT c.id, c.serial_number, c.status, c.current_stamps, c.rewards_available, c.cycles_completed, c.last_stamp_at,
         cu.name AS customer_name, cu.phone,
         p.stamps_required, p.reward_description, p.cooldown_minutes, p.max_stamps_per_scan, p.active AS program_active
  FROM cards c
  JOIN customers cu ON cu.id = c.customer_id
  JOIN loyalty_programs p ON p.id = c.program_id`;

function cooldownRemaining(row: Pick<CardRow, "last_stamp_at" | "cooldown_minutes">, now = new Date()): number {
  if (!row.last_stamp_at || row.cooldown_minutes === 0) return 0;
  const ms = new Date(row.last_stamp_at).getTime() + row.cooldown_minutes * 60_000 - now.getTime();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

function summary(row: CardRow): CardSummary {
  return {
    serial: row.serial_number,
    customerName: row.customer_name,
    phoneMasked: maskPhone(row.phone),
    currentStamps: row.current_stamps,
    stampsRequired: row.stamps_required,
    rewardsAvailable: row.rewards_available,
    rewardDescription: row.reward_description,
    maxStampsPerScan: row.max_stamps_per_scan,
    lastStampAt: row.last_stamp_at ? new Date(row.last_stamp_at).toISOString() : null,
    cooldownRemainingMinutes: cooldownRemaining(row),
  };
}

export const lookupSchema = z.union([z.object({ token: z.string().min(10).max(120) }), z.object({ phone: z.string().min(8).max(20) })]);

/** Resolves a scanned barcode or a phone number to a card of the actor's merchant. */
export async function lookupCard(actor: Actor, input: z.infer<typeof lookupSchema>): Promise<CardSummary> {
  requirePermission(actor, PERMISSIONS.STAMP);
  await rateLimit(`lookup:${actor.staffUserId}`, 120, 60);
  let row: CardRow | null = null;
  if ("token" in input) {
    const serial = verifyCardToken(input.token);
    if (!serial) throw new AppError("errors.invalidCard", 404);
    row = await one<CardRow>(`${CARD_SQL} WHERE c.serial_number = $1 AND c.merchant_id = $2`, [serial, actor.merchantId]);
  } else {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new AppError("errors.invalidPhone");
    row = await one<CardRow>(
      `${CARD_SQL} WHERE cu.phone = $1 AND c.merchant_id = $2 AND c.status = 'ACTIVE' AND p.active ORDER BY c.created_at DESC LIMIT 1`,
      [phone, actor.merchantId],
    );
  }
  if (!row) throw new AppError("errors.invalidCard", 404);
  if (row.status === "VOID") throw new AppError("errors.cardVoid");
  return summary(row);
}

async function lockCard(db: Db, merchantId: string, serial: string): Promise<CardRow> {
  const row = await one<CardRow>(`${CARD_SQL} WHERE c.serial_number = $1 AND c.merchant_id = $2 FOR UPDATE OF c`, [serial, merchantId], db);
  if (!row) throw new AppError("errors.invalidCard", 404);
  if (row.status === "VOID") throw new AppError("errors.cardVoid");
  if (!row.program_active) throw new AppError("errors.programInactive");
  return row;
}

/** Pure stamp arithmetic: overflow rolls into the next cycle and banks a reward. */
export function applyStamps(current: number, required: number, quantity: number) {
  const total = current + quantity;
  const earned = Math.floor(total / required);
  return { current: total % required, earned };
}

export type StampOptions = {
  source: "STAFF" | "POS";
  device?: string | null;
  /** POS events are verified purchases; the cooldown still applies unless explicitly bypassed. */
  bypassCooldown?: boolean;
  branchId?: string | null;
};

export async function addStamps(
  actor: Actor | { merchantId: string; staffUserId: null },
  serial: string,
  quantity: number,
  opts: StampOptions = { source: "STAFF" },
): Promise<CardSummary & { rewardsEarned: number }> {
  if ("role" in actor) requirePermission(actor, PERMISSIONS.STAMP);
  if (!Number.isInteger(quantity) || quantity < 1) throw new AppError("errors.invalidInput");
  const branchId = opts.branchId ?? ("branchId" in actor ? actor.branchId : null);
  if (opts.source === "STAFF" && !branchId) throw new AppError("errors.branchRequired");

  return tx(async (db, onCommit) => {
    const row = await lockCard(db, actor.merchantId, serial);
    if (quantity > row.max_stamps_per_scan) throw new AppError("errors.tooManyStamps", 400, { max: row.max_stamps_per_scan });
    const wait = cooldownRemaining(row);
    if (wait > 0 && !opts.bypassCooldown) throw new AppError("errors.cooldown", 429, { minutes: wait });

    const { current, earned } = applyStamps(row.current_stamps, row.stamps_required, quantity);
    const updated = await one<CardRow>(
      `UPDATE cards SET current_stamps = $2, rewards_available = rewards_available + $3, cycles_completed = cycles_completed + $3,
              total_stamps = total_stamps + $4, last_stamp_at = now(), updated_at = now()
       WHERE id = $1 RETURNING id`,
      [row.id, current, earned, quantity],
      db,
    );
    if (!updated) throw new AppError("errors.notFound", 404);
    await db.query(
      `INSERT INTO stamp_events(merchant_id, card_id, branch_id, staff_user_id, quantity, source, device) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [actor.merchantId, row.id, branchId, actor.staffUserId, quantity, opts.source, opts.device?.slice(0, 200) ?? null],
    );
    await enqueue(db, "wallet.card_changed", { cardId: row.id });
    onCommit(scheduleDrain);
    const fresh = (await one<CardRow>(`${CARD_SQL} WHERE c.id = $1`, [row.id], db))!;
    return { ...summary(fresh), rewardsEarned: earned };
  });
}

export async function redeemReward(actor: Actor, serial: string, device?: string | null): Promise<CardSummary & { redeemed: string }> {
  requirePermission(actor, PERMISSIONS.REDEEM);
  if (!actor.branchId) throw new AppError("errors.branchRequired");
  return tx(async (db, onCommit) => {
    const row = await lockCard(db, actor.merchantId, serial);
    if (row.rewards_available < 1) throw new AppError("errors.noReward");
    await db.query(`UPDATE cards SET rewards_available = rewards_available - 1, updated_at = now() WHERE id = $1`, [row.id]);
    await db.query(
      `INSERT INTO redemptions(merchant_id, card_id, branch_id, staff_user_id, reward_description) VALUES ($1,$2,$3,$4,$5)`,
      [actor.merchantId, row.id, actor.branchId, actor.staffUserId, row.reward_description],
    );
    await audit(db, actor, "card.redeem", "card", row.serial_number, { device: device ?? null });
    await enqueue(db, "wallet.card_changed", { cardId: row.id });
    onCommit(scheduleDrain);
    const fresh = (await one<CardRow>(`${CARD_SQL} WHERE c.id = $1`, [row.id], db))!;
    return { ...summary(fresh), redeemed: row.reward_description };
  });
}

