import type { WalletProvider } from "./provider";

/**
 * Runs the whole product locally without Apple/Google credentials.
 * Customers use the web card (/c/<serial>), which renders the same pass data.
 */
export class MockWalletProvider implements WalletProvider {
  readonly name = "mock" as const;
  readonly log: string[] = [];
  appleAvailable() {
    return false;
  }
  googleAvailable() {
    return false;
  }
  async buildApplePass(): Promise<Buffer> {
    throw new Error("Apple Wallet is not configured (WALLET_PROVIDER=mock)");
  }
  async googleSaveUrl(): Promise<string> {
    throw new Error("Google Wallet is not configured (WALLET_PROVIDER=mock)");
  }
  async cardChanged(view: Parameters<WalletProvider["cardChanged"]>[0], tokens: string[]) {
    this.log.push(`card ${view.serial}: ${view.currentStamps}/${view.stampsRequired}, rewards=${view.rewardsAvailable}, apns=${tokens.length}`);
  }
  async programChanged(programId: string) {
    this.log.push(`program ${programId} changed`);
  }
}
