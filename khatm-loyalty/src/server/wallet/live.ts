import type { WalletProvider } from "./provider";
import type { PassView } from "./pass-view";
import { buildPkpass, pushPassUpdates, type AppleConfig } from "./apple";
import { saveUrl, updateObject, upsertClass, type GoogleConfig } from "./google";
import { one, pool } from "../db";
import { parseDesign } from "../domain/design";

/** Real Apple + Google Wallet. Each side is enabled only when its credentials are configured. */
export class LiveWalletProvider implements WalletProvider {
  readonly name = "live" as const;
  constructor(
    private readonly apple: AppleConfig | null,
    private readonly google: GoogleConfig | null,
  ) {}

  appleAvailable() {
    return this.apple !== null;
  }
  googleAvailable() {
    return this.google !== null;
  }

  async buildApplePass(view: PassView) {
    if (!this.apple) throw new Error("Apple Wallet not configured");
    return buildPkpass(view, this.apple);
  }

  async googleSaveUrl(view: PassView) {
    if (!this.google) throw new Error("Google Wallet not configured");
    return saveUrl(this.google, view);
  }

  async cardChanged(view: PassView, applePushTokens: string[]) {
    const errors: string[] = [];
    if (this.apple && applePushTokens.length) {
      const gone = await pushPassUpdates(this.apple, applePushTokens).catch((e) => {
        errors.push(`apns: ${e}`);
        return [] as string[];
      });
      if (gone.length) await pool().query(`DELETE FROM wallet_registrations WHERE push_token = ANY($1)`, [gone]);
    }
    if (this.google) await updateObject(this.google, view).catch((e) => errors.push(`google: ${e}`));
    if (errors.length) throw new Error(errors.join("; "));
  }

  async programChanged(programId: string) {
    if (!this.google) return;
    const p = await one<{ id: string; name: string; reward_description: string; design: unknown; merchant_id: string; merchant_name: string }>(
      `SELECT p.id, p.name, p.reward_description, p.design, m.id AS merchant_id, m.name AS merchant_name
       FROM loyalty_programs p JOIN merchants m ON m.id = p.merchant_id WHERE p.id = $1`,
      [programId],
    );
    if (!p) return;
    await upsertClass(this.google, {
      programId: p.id,
      programName: p.name,
      merchantName: p.merchant_name,
      merchantId: p.merchant_id,
      design: parseDesign(p.design),
      rewardDescription: p.reward_description,
    });
  }
}
