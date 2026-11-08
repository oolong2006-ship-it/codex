import { q, pool } from "./db";
import { registerHandler } from "./outbox";
import { wallet } from "./wallet";
import { passViewById } from "./wallet/pass-view";
import { messaging } from "./messaging/provider";

registerHandler("wallet.card_changed", async (p) => {
  const view = await passViewById(String(p.cardId));
  if (!view) return; // card deleted since
  const regs = await q<{ push_token: string }>(`SELECT push_token FROM wallet_registrations WHERE serial_number = $1`, [view.serial]);
  await wallet().cardChanged(view, regs.map((r) => r.push_token));
});

registerHandler("wallet.program_changed", async (p) => {
  await wallet().programChanged(String(p.programId));
  // Refresh every Apple pass of the program so design/reward text updates too.
  const cards = await q<{ id: string }>(`SELECT id FROM cards WHERE program_id = $1 AND status = 'ACTIVE'`, [String(p.programId)]);
  for (const c of cards) {
    const view = await passViewById(c.id);
    if (!view) continue;
    const regs = await q<{ push_token: string }>(`SELECT push_token FROM wallet_registrations WHERE serial_number = $1`, [view.serial]);
    if (regs.length) await wallet().cardChanged(view, regs.map((r) => r.push_token));
  }
});

registerHandler("message.send", async (p) => {
  const res = await messaging().send({ to: String(p.to), body: String(p.body) });
  if (p.logId) {
    await pool().query(`UPDATE message_log SET status = $2, provider_ref = $3 WHERE id = $1`, [p.logId, res.ok ? "SENT" : "FAILED", res.ref ?? res.error ?? null]);
  }
  if (!res.ok) throw new Error(res.error ?? "send failed");
});
