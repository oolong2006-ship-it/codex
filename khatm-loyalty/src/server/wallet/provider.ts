import type { PassView } from "./pass-view";

export interface WalletProvider {
  readonly name: "mock" | "live";
  appleAvailable(): boolean;
  googleAvailable(): boolean;
  /** Signed .pkpass bytes. */
  buildApplePass(view: PassView): Promise<Buffer>;
  /** "Save to Google Wallet" URL. */
  googleSaveUrl(view: PassView): Promise<string>;
  /** Push the new state to devices / Google after a committed change. */
  cardChanged(view: PassView, applePushTokens: string[]): Promise<void>;
  /** Program design/name/reward changed — refresh class-level data. */
  programChanged(programId: string): Promise<void>;
}
