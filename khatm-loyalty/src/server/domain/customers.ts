import { one, q, tx, pool } from "../db";
import { AppError } from "../errors";
import { requirePermission, type Actor } from "../actor";
import { PERMISSIONS } from "../rbac";
import { audit } from "../audit";
import { timingSafeEqual } from "node:crypto";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  createdAt: Date;
  marketingOptIn: boolean;
  serial: string | null;
  currentStamps: number;
  rewardsAvailable: number;
  totalStamps: number;
  lastStampAt: Date | null;
};

const LIST_SQL = `
  SELECT cu.id, cu.name, cu.phone, cu.created_at AS "createdAt", cu.marketing_opt_in AS "marketingOptIn",
         c.serial_number AS serial, coalesce(c.current_stamps,0) AS "currentStamps",
         coalesce(c.rewards_available,0) AS "rewardsAvailable", coalesce(c.total_stamps,0) AS "totalStamps",
         c.last_stamp_at AS "lastStampAt"
  FROM customers cu
  LEFT JOIN LATERAL (
    SELECT * FROM cards WHERE customer_id = cu.id AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1
  ) c ON true
  WHERE cu.merchant_id = $1`;

export async function listCustomers(actor: Actor, opts: { search?: string; limit?: number; offset?: number } = {}): Promise<{ rows: CustomerRow[]; total: number }> {
  requirePermission(actor, PERMISSIONS.CUSTOMER_VIEW);
  const search = opts.search?.trim();
  const params: unknown[] = [actor.merchantId];
  let filter = "";
  if (search) {
    params.push(`%${search.replace(/[%_\\]/g, (c) => "\\" + c)}%`);
    filter = ` AND (cu.name ILIKE $2 OR cu.phone LIKE $2)`;
  }
  const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM customers cu WHERE cu.merchant_id = $1${filter}`, params);
  const rows = await q<CustomerRow>(
    `${LIST_SQL}${filter} ORDER BY c.last_stamp_at DESC NULLS LAST, cu.created_at DESC LIMIT ${Math.min(opts.limit ?? 50, 500)} OFFSET ${Math.max(opts.offset ?? 0, 0)}`,
    params,
  );
  return { rows, total: total?.n ?? 0 };
}

/** Prevents CSV/spreadsheet formula injection. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function customersCsv(actor: Actor): Promise<string> {
  requirePermission(actor, PERMISSIONS.CUSTOMER_PRIVACY);
  const rows = await q<CustomerRow>(`${LIST_SQL} ORDER BY cu.created_at`, [actor.merchantId]);
  await audit(pool(), actor, "customers.export_csv", "customer", undefined, { count: rows.length });
  const header = ["name", "phone", "joined_at", "current_stamps", "rewards_available", "total_stamps", "last_visit_at", "marketing_opt_in"];
  const lines = rows.map((r) => [r.name, r.phone, r.createdAt, r.currentStamps, r.rewardsAvailable, r.totalStamps, r.lastStampAt, r.marketingOptIn].map(csvCell).join(","));
  return "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";
}

/** PDPL: everything we hold about one customer. */
export async function exportCustomer(actor: Actor, customerId: string) {
  requirePermission(actor, PERMISSIONS.CUSTOMER_PRIVACY);
  const customer = await one<Record<string, unknown>>(
    `SELECT id, name, phone, consent_at, marketing_opt_in, created_at FROM customers WHERE id = $1 AND merchant_id = $2`,
    [customerId, actor.merchantId],
  );
  if (!customer) throw new AppError("errors.notFound", 404);
  const cards = await q(`SELECT serial_number, current_stamps, rewards_available, total_stamps, cycles_completed, status, created_at FROM cards WHERE customer_id = $1 AND merchant_id = $2`, [customerId, actor.merchantId]);
  const events = await q(
    `SELECT e.quantity, e.source, e.created_at FROM stamp_events e JOIN cards c ON c.id = e.card_id WHERE c.customer_id = $1 AND c.merchant_id = $2 ORDER BY e.created_at`,
    [customerId, actor.merchantId],
  );
  const redemptions = await q(
    `SELECT r.reward_description, r.created_at FROM redemptions r JOIN cards c ON c.id = r.card_id WHERE c.customer_id = $1 AND c.merchant_id = $2 ORDER BY r.created_at`,
    [customerId, actor.merchantId],
  );
  await audit(pool(), actor, "customer.export", "customer", customerId);
  return { exportedAt: new Date().toISOString(), customer, cards, stampEvents: events, redemptions };
}

/**
 * PDPL erasure: deletes the customer, their cards and wallet registrations.
 * Stamp/redemption history is kept anonymously (card_id set to NULL) for aggregate analytics.
 */
export async function deleteCustomer(actor: Actor, customerId: string) {
  requirePermission(actor, PERMISSIONS.CUSTOMER_PRIVACY);
  await tx(async (db) => {
    const r = await db.query(`DELETE FROM customers WHERE id = $1 AND merchant_id = $2`, [customerId, actor.merchantId]);
    if (r.rowCount === 0) throw new AppError("errors.notFound", 404);
    await audit(db, actor, "customer.delete", "customer", customerId);
  });
}

/** Customer self-service erasure from the web card (authenticated by the card's auth token). */
export async function deleteSelf(serial: string, authToken: string) {
  await tx(async (db) => {
    const c = await one<{ customer_id: string; merchant_id: string; auth_token: string }>(
      `SELECT customer_id, merchant_id, auth_token FROM cards WHERE serial_number = $1 FOR UPDATE`,
      [serial],
      db,
    );
    if (!c || !safeEqual(c.auth_token, authToken)) throw new AppError("errors.notFound", 404);
    await db.query(`DELETE FROM customers WHERE id = $1`, [c.customer_id]);
    await audit(db, { merchantId: c.merchant_id, staffUserId: null }, "customer.self_delete", "customer", c.customer_id);
  });
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
