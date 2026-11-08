import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import http2 from "node:http2";
import forge from "node-forge";
import type { PassView } from "./pass-view";
import { tilePng } from "./png";
import { zipStore } from "./zip";

/**
 * Apple Wallet (.pkpass) generation and APNs update pushes.
 * Spec: https://developer.apple.com/documentation/walletpasses
 */
export type AppleConfig = {
  passTypeId: string;
  teamId: string;
  certPem: string;
  keyPem: string;
  keyPassphrase?: string;
  wwdrPem: string;
  webServiceUrl: string;
  apnsHost: string;
};

export function loadAppleConfig(e: {
  APPLE_PASS_TYPE_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_PASS_CERT_PEM_PATH?: string;
  APPLE_PASS_KEY_PEM_PATH?: string;
  APPLE_PASS_KEY_PASSPHRASE?: string;
  APPLE_WWDR_CERT_PEM_PATH?: string;
  APPLE_APNS_HOST: string;
  APP_URL: string;
}): AppleConfig | null {
  if (!e.APPLE_PASS_TYPE_ID || !e.APPLE_TEAM_ID || !e.APPLE_PASS_CERT_PEM_PATH || !e.APPLE_PASS_KEY_PEM_PATH || !e.APPLE_WWDR_CERT_PEM_PATH) {
    return null;
  }
  return {
    passTypeId: e.APPLE_PASS_TYPE_ID,
    teamId: e.APPLE_TEAM_ID,
    certPem: readFileSync(e.APPLE_PASS_CERT_PEM_PATH, "utf8"),
    keyPem: readFileSync(e.APPLE_PASS_KEY_PEM_PATH, "utf8"),
    keyPassphrase: e.APPLE_PASS_KEY_PASSPHRASE,
    wwdrPem: readFileSync(e.APPLE_WWDR_CERT_PEM_PATH, "utf8"),
    webServiceUrl: `${e.APP_URL}/api/wallet/apple`,
    apnsHost: e.APPLE_APNS_HOST,
  };
}

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")})`;

const STRINGS: Record<"ar" | "en", Record<string, string>> = {
  ar: {
    STAMPS: "الأختام",
    REWARDS: "مكافآت جاهزة",
    REWARD: "المكافأة",
    MEMBER: "العضو",
    TERMS: "الشروط",
    WEB_CARD: "بطاقتك على الويب",
    STAMP_ADDED: "تحدّثت أختامك: %@",
    REWARD_READY: "🎉 مكافأتك جاهزة! (%@)",
    PROGRESS: "%@",
  },
  en: {
    STAMPS: "Stamps",
    REWARDS: "Rewards ready",
    REWARD: "Reward",
    MEMBER: "Member",
    TERMS: "Terms",
    WEB_CARD: "Your web card",
    STAMP_ADDED: "Stamps updated: %@",
    REWARD_READY: "🎉 Your reward is ready! (%@)",
    PROGRESS: "%@",
  },
};

/** pass.strings files are UTF-16 with BOM per Apple's localization guidance. */
function stringsFile(lang: "ar" | "en"): Buffer {
  const body = Object.entries(STRINGS[lang])
    .map(([k, v]) => `"${k}" = "${v.replace(/"/g, '\\"')}";`)
    .join("\n");
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body + "\n", "utf16le")]);
}

export function buildPassJson(view: PassView, cfg: Pick<AppleConfig, "passTypeId" | "teamId" | "webServiceUrl">) {
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: view.serial,
    authenticationToken: view.authToken,
    webServiceURL: cfg.webServiceUrl,
    organizationName: view.merchantName,
    description: view.programName,
    logoText: view.merchantName,
    backgroundColor: rgb(view.design.bg),
    foregroundColor: rgb(view.design.fg),
    labelColor: rgb(view.design.accent),
    sharingProhibited: true,
    voided: view.status === "VOID",
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: view.barcode,
        messageEncoding: "iso-8859-1",
        altText: view.serial.slice(-6),
      },
    ],
    storeCard: {
      headerFields: [
        { key: "rewards", label: "REWARDS", value: view.rewardsAvailable, changeMessage: "REWARD_READY" },
      ],
      primaryFields: [
        {
          key: "stamps",
          label: "STAMPS",
          value: `${view.currentStamps} / ${view.stampsRequired}`,
          changeMessage: "STAMP_ADDED",
        },
      ],
      secondaryFields: [{ key: "row", label: "", value: view.stampRow }],
      auxiliaryFields: [
        { key: "reward", label: "REWARD", value: view.rewardDescription },
        { key: "member", label: "MEMBER", value: view.customerName },
      ],
      backFields: [
        ...(view.terms ? [{ key: "terms", label: "TERMS", value: view.terms }] : []),
        { key: "web", label: "WEB_CARD", value: view.webCardUrl },
      ],
    },
  };
}

const sha1 = (b: Buffer) => createHash("sha1").update(b).digest("hex");

export function signManifest(manifest: Buffer, cfg: Pick<AppleConfig, "certPem" | "keyPem" | "keyPassphrase" | "wwdrPem">): Buffer {
  const cert = forge.pki.certificateFromPem(cfg.certPem);
  const wwdr = forge.pki.certificateFromPem(cfg.wwdrPem);
  const key = cfg.keyPassphrase
    ? forge.pki.decryptRsaPrivateKey(cfg.keyPem, cfg.keyPassphrase)
    : forge.pki.privateKeyFromPem(cfg.keyPem);
  if (!key) throw new Error("Apple pass key could not be decrypted");
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString("binary"));
  p7.addCertificate(wwdr);
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256!,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType!, value: forge.pki.oids.data! },
      { type: forge.pki.oids.messageDigest! },
      // forge's typings declare value as string, but it requires a Date for signingTime.
      { type: forge.pki.oids.signingTime!, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

export function buildPkpass(view: PassView, cfg: AppleConfig): Buffer {
  const files: Record<string, Buffer> = {
    "pass.json": Buffer.from(JSON.stringify(buildPassJson(view, cfg)), "utf8"),
    "icon.png": tilePng(29, view.design.bg, view.design.accent),
    "icon@2x.png": tilePng(58, view.design.bg, view.design.accent),
    "icon@3x.png": tilePng(87, view.design.bg, view.design.accent),
    "logo.png": tilePng(50, view.design.bg, view.design.accent),
    "logo@2x.png": tilePng(100, view.design.bg, view.design.accent),
    "ar.lproj/pass.strings": stringsFile("ar"),
    "en.lproj/pass.strings": stringsFile("en"),
  };
  const manifest = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(files).map(([n, b]) => [n, sha1(b)]))), "utf8");
  const signature = signManifest(manifest, cfg);
  return zipStore([
    ...Object.entries(files).map(([name, data]) => ({ name, data })),
    { name: "manifest.json", data: manifest },
    { name: "signature", data: signature },
  ]);
}

/**
 * Sends an empty APNs push for each registered device; Wallet then calls our
 * web service to fetch the updated pass. Returns tokens Apple reports as gone (410).
 */
export async function pushPassUpdates(cfg: AppleConfig, tokens: string[]): Promise<string[]> {
  if (tokens.length === 0) return [];
  const session = http2.connect(`https://${cfg.apnsHost}`, {
    cert: cfg.certPem,
    key: cfg.keyPem,
    passphrase: cfg.keyPassphrase,
  });
  const gone: string[] = [];
  try {
    await Promise.all(
      tokens.map(
        (token) =>
          new Promise<void>((resolve, reject) => {
            const req = session.request({
              ":method": "POST",
              ":path": `/3/device/${token}`,
              "apns-topic": cfg.passTypeId,
              "content-type": "application/json",
            });
            req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
            req.on("response", (h) => {
              const status = Number(h[":status"]);
              if (status === 410 || status === 400) gone.push(token);
            });
            req.on("error", reject);
            req.on("close", () => resolve());
            req.end("{}");
          }),
      ),
    );
  } finally {
    session.close();
  }
  return gone;
}
