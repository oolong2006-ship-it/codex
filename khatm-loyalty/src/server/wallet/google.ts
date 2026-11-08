import { readFileSync } from "node:fs";
import { importPKCS8, SignJWT } from "jose";
import type { PassView } from "./pass-view";

/**
 * Google Wallet loyalty passes.
 * Docs: https://developers.google.com/wallet/retail/loyalty-cards
 * One LoyaltyClass per program, one LoyaltyObject per card.
 */
export type GoogleConfig = {
  issuerId: string;
  clientEmail: string;
  privateKeyPem: string;
  appUrl: string;
};

const API = "https://walletobjects.googleapis.com/walletobjects/v1";

export function loadGoogleConfig(e: { GOOGLE_WALLET_ISSUER_ID?: string; GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_PATH?: string; APP_URL: string }): GoogleConfig | null {
  if (!e.GOOGLE_WALLET_ISSUER_ID || !e.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_PATH) return null;
  const sa = JSON.parse(readFileSync(e.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_PATH, "utf8")) as { client_email: string; private_key: string };
  return { issuerId: e.GOOGLE_WALLET_ISSUER_ID, clientEmail: sa.client_email, privateKeyPem: sa.private_key, appUrl: e.APP_URL };
}

export const classId = (cfg: GoogleConfig, programId: string) => `${cfg.issuerId}.program_${programId.replace(/-/g, "")}`;
export const objectId = (cfg: GoogleConfig, serial: string) => `${cfg.issuerId}.card_${serial}`;

const localized = (ar: string, en?: string) => ({
  defaultValue: { language: "ar", value: ar },
  ...(en ? { translatedValues: [{ language: "en", value: en }] } : {}),
});

export function buildClass(cfg: GoogleConfig, view: Pick<PassView, "programId" | "programName" | "merchantName" | "merchantId" | "design" | "rewardDescription">) {
  return {
    id: classId(cfg, view.programId),
    issuerName: view.merchantName,
    programName: view.programName,
    localizedProgramName: localized(view.programName),
    programLogo: {
      sourceUri: { uri: `${cfg.appUrl}/api/brand/${view.merchantId}/logo.png` },
      contentDescription: localized(view.merchantName),
    },
    hexBackgroundColor: view.design.bg,
    reviewStatus: "UNDER_REVIEW",
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
    rewardsTier: view.rewardDescription,
  };
}

export function buildObject(cfg: GoogleConfig, view: PassView) {
  return {
    id: objectId(cfg, view.serial),
    classId: classId(cfg, view.programId),
    state: view.status === "VOID" ? "INACTIVE" : "ACTIVE",
    accountId: view.serial,
    accountName: view.customerName,
    barcode: { type: "QR_CODE", value: view.barcode, alternateText: view.serial.slice(-6) },
    loyaltyPoints: {
      label: "الأختام",
      localizedLabel: localized("الأختام", "Stamps"),
      balance: { string: `${view.currentStamps} / ${view.stampsRequired}` },
    },
    secondaryLoyaltyPoints: {
      label: "مكافآت جاهزة",
      localizedLabel: localized("مكافآت جاهزة", "Rewards ready"),
      balance: { int: view.rewardsAvailable },
    },
    textModulesData: [
      { id: "row", header: "التقدم", body: view.stampRow },
      { id: "reward", header: "المكافأة", body: view.rewardDescription },
      ...(view.terms ? [{ id: "terms", header: "الشروط", body: view.terms }] : []),
    ],
    linksModuleData: { uris: [{ id: "web", uri: view.webCardUrl, description: "بطاقتك على الويب" }] },
  };
}

async function key(cfg: GoogleConfig) {
  return importPKCS8(cfg.privateKeyPem, "RS256");
}

/** "Save to Google Wallet" link: a signed JWT that embeds the class + object. */
export async function saveUrl(cfg: GoogleConfig, view: PassView): Promise<string> {
  const jwt = await new SignJWT({
    origins: [cfg.appUrl],
    typ: "savetowallet",
    payload: { loyaltyClasses: [buildClass(cfg, view)], loyaltyObjects: [buildObject(cfg, view)] },
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(cfg.clientEmail)
    .setAudience("google")
    .setIssuedAt()
    .sign(await key(cfg));
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(cfg: GoogleConfig): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/wallet_object.issuer" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(cfg.clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(await key(cfg));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`google oauth ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

/** Updates the object if the customer saved it; 404 (never saved) is not an error. */
export async function updateObject(cfg: GoogleConfig, view: PassView): Promise<void> {
  const res = await fetch(`${API}/loyaltyObject/${encodeURIComponent(objectId(cfg, view.serial))}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${await accessToken(cfg)}`, "content-type": "application/json" },
    body: JSON.stringify(buildObject(cfg, view)),
  });
  if (!res.ok && res.status !== 404) throw new Error(`google loyaltyObject update ${res.status}`);
}

export async function upsertClass(cfg: GoogleConfig, view: Parameters<typeof buildClass>[1]): Promise<void> {
  const body = JSON.stringify(buildClass(cfg, view));
  const headers = { authorization: `Bearer ${await accessToken(cfg)}`, "content-type": "application/json" };
  const id = encodeURIComponent(classId(cfg, view.programId));
  const put = await fetch(`${API}/loyaltyClass/${id}`, { method: "PUT", headers, body });
  if (put.status === 404) {
    const ins = await fetch(`${API}/loyaltyClass`, { method: "POST", headers, body });
    if (!ins.ok) throw new Error(`google loyaltyClass insert ${ins.status}`);
  } else if (!put.ok) {
    throw new Error(`google loyaltyClass update ${put.status}`);
  }
}
