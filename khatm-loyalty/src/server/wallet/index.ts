import { env } from "../env";
import { loadAppleConfig } from "./apple";
import { loadGoogleConfig } from "./google";
import { LiveWalletProvider } from "./live";
import { MockWalletProvider } from "./mock";
import type { WalletProvider } from "./provider";

const g = globalThis as unknown as { __khatmWallet?: WalletProvider };

export function wallet(): WalletProvider {
  if (!g.__khatmWallet) {
    const e = env();
    g.__khatmWallet = e.WALLET_PROVIDER === "live" ? new LiveWalletProvider(loadAppleConfig(e), loadGoogleConfig(e)) : new MockWalletProvider();
  }
  return g.__khatmWallet;
}

/** Test hook. */
export function setWalletProvider(p: WalletProvider) {
  g.__khatmWallet = p;
}
