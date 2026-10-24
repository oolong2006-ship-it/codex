import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Keys for the few pieces of contact data the platform must keep (a WhatsApp
 * number, to reply). Lookups use a keyed hash; the value itself is encrypted.
 */
export interface PiiKeys {
  /** 32 bytes, base64. */
  encryptionKey: string;
  /** Secret pepper for lookup hashes. */
  hashPepper: string;
}

export function piiKeysFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PiiKeys {
  const encryptionKey = env.PII_ENCRYPTION_KEY ?? "";
  const hashPepper = env.PII_HASH_PEPPER ?? "";
  if (Buffer.from(encryptionKey, "base64").length !== 32 || hashPepper.length < 16) {
    throw new Error(
      "PII_ENCRYPTION_KEY (32 bytes base64) and PII_HASH_PEPPER (16+ chars) are required",
    );
  }
  return { encryptionKey, hashPepper };
}

/** Digits only, Saudi local numbers in international form. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("05") && digits.length === 10) return `966${digits.slice(1)}`;
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

export function hashPhone(phone: string, keys: PiiKeys): string {
  return createHmac("sha256", keys.hashPepper).update(normalizePhone(phone)).digest("hex");
}

export function encryptPii(value: string, keys: PiiKeys): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keys.encryptionKey, "base64"), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptPii(blob: string, keys: PiiKeys): string {
  const buf = Buffer.from(blob, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keys.encryptionKey, "base64"),
    buf.subarray(0, 12),
  );
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
