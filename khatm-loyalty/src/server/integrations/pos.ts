import { createHmac } from "node:crypto";
import { one, pool } from "../db";
import { AppError } from "../errors";
import { requirePermission, type Actor } from "../actor";
import { PERMISSIONS } from "../rbac";
import { audit } from "../audit";
import { randomSecret } from "../tokens";
import { normalizePhone } from "../phone";
import { addStamps } from "../domain/stamping";
import { safeEqual } from "../domain/customers";
import { foodicsAdapter } from "./foodics";

/** A completed purchase, normalised from any POS. */
export type PosOrder = {
  externalId: string;
  phone: string | null;
  externalBranchId: string | null;
  completed: boolean;
};

export interface PosAdapter {
  readonly provider: "foodics" | "mock";
  /** Parses the provider's webhook JSON. Returns null for events we ignore. */
  parse(body: unknown): PosOrder | null;
}

export const mockAdapter: PosAdapter = {
  provider: "mock",
  parse(body) {
    const b = body as { id?: string; phone?: string; branch?: string; status?: string };
    if (!b?.id) return null;
    return { externalId: String(b.id), phone: b.phone ?? null, externalBranchId: b.branch ?? null, completed: b.status === "completed" };
  },
};

const ADAPTERS: Record<string, PosAdapter> = { foodics: foodicsAdapter, mock: mockAdapter };

export function signBody(secret: string, raw: string) {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

export async function enableIntegration(actor: Actor, provider: "foodics" | "mock") {
  requirePermission(actor, PERMISSIONS.INTEGRATION_MANAGE);
  const program = await one<{ id: string }>(`SELECT id FROM loyalty_programs WHERE merchant_id = $1 ORDER BY created_at LIMIT 1`, [actor.merchantId]);
  if (!program) throw new AppError("errors.notFound", 404);
  const row = await one<{ id: string }>(
    `INSERT INTO pos_integrations(merchant_id, provider, program_id, webhook_secret) VALUES ($1,$2,$3,$4)
     ON CONFLICT (merchant_id, provider) DO UPDATE SET active = true RETURNING id`,
    [actor.merchantId, provider, program.id, randomSecret(32)],
  );
  await audit(pool(), actor, "integration.enable", "integration", row!.id, { provider });
  return row!.id;
}

export async function getIntegration(actor: Actor, provider: "foodics" | "mock") {
  requirePermission(actor, PERMISSIONS.INTEGRATION_MANAGE);
  return one<{ id: string; webhook_secret: string; active: boolean }>(
    `SELECT id, webhook_secret, active FROM pos_integrations WHERE merchant_id = $1 AND provider = $2`,
    [actor.merchantId, provider],
  );
}

export type WebhookResult = "stamped" | "duplicate" | "ignored" | "no_card" | "cooldown" | "error";

/**
 * Webhook entry point. Authenticated by HMAC-SHA256 of the raw body with the
 * integration's secret. Idempotent per (integration, external order id).
 */
export async function handlePosWebhook(integrationId: string, raw: string, signature: string | null): Promise<WebhookResult> {
  if (!/^[0-9a-f-]{36}$/i.test(integrationId)) throw new AppError("errors.notFound", 404);
  const integ = await one<{ id: string; merchant_id: string; provider: string; program_id: string; webhook_secret: string; branch_map: Record<string, string>; active: boolean }>(
    `SELECT id, merchant_id, provider, program_id, webhook_secret, branch_map, active FROM pos_integrations WHERE id = $1`,
    [integrationId],
  );
  if (!integ || !integ.active) throw new AppError("errors.notFound", 404);
  if (!signature || !safeEqual(signBody(integ.webhook_secret, raw), signature.trim().toLowerCase())) throw new AppError("errors.forbidden", 401);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AppError("errors.invalidInput");
  }
  const order = ADAPTERS[integ.provider]!.parse(body);
  if (!order || !order.completed) return "ignored";

  const claimed = await one(
    `INSERT INTO pos_events(integration_id, external_id, result) VALUES ($1,$2,'processing') ON CONFLICT DO NOTHING RETURNING 1`,
    [integ.id, order.externalId],
  );
  if (!claimed) return "duplicate";

  const result = await (async (): Promise<WebhookResult> => {
    const phone = order.phone ? normalizePhone(order.phone) : null;
    if (!phone) return "no_card";
    const card = await one<{ serial_number: string }>(
      `SELECT c.serial_number FROM cards c JOIN customers cu ON cu.id = c.customer_id
       WHERE c.merchant_id = $1 AND c.program_id = $2 AND cu.phone = $3 AND c.status = 'ACTIVE'`,
      [integ.merchant_id, integ.program_id, phone],
    );
    if (!card) return "no_card";
    const branchId = order.externalBranchId ? (integ.branch_map[order.externalBranchId] ?? null) : null;
    try {
      await addStamps({ merchantId: integ.merchant_id, staffUserId: null }, card.serial_number, 1, { source: "POS", branchId, device: integ.provider });
      return "stamped";
    } catch (e) {
      if (e instanceof AppError && e.code === "errors.cooldown") return "cooldown";
      throw e;
    }
  })().catch(() => "error" as const);

  await pool().query(`UPDATE pos_events SET result = $3 WHERE integration_id = $1 AND external_id = $2`, [integ.id, order.externalId, result]);
  return result;
}
