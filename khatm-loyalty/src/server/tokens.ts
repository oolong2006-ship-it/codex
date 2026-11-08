import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Card barcode tokens: `K<kid>.<serial>.<sig>`.
 * The barcode on a wallet pass never contains a raw database id; it carries the
 * card serial plus an HMAC so a forged or guessed code is rejected before any
 * lookup. Multiple keys allow rotation: the first key signs, all keys verify.
 */
type Key = { kid: string; secret: string };

export function parseKeys(raw: string): Key[] {
  const keys = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(":");
      // A bare secret (no "kid:") is key "1" — convenient for platform-generated values.
      if (i <= 0) return { kid: "1", secret: p };
      return { kid: p.slice(0, i), secret: p.slice(i + 1) };
    });
  if (keys.length === 0) throw new Error("CARD_TOKEN_KEYS is empty");
  for (const k of keys) {
    if (!/^[a-z0-9]{1,8}$/i.test(k.kid)) throw new Error("CARD_TOKEN_KEYS kid must be 1-8 alphanumerics");
    if (k.secret.length < 32) throw new Error("CARD_TOKEN_KEYS secrets must be at least 32 characters");
  }
  return keys;
}

function sign(secret: string, serial: string) {
  return createHmac("sha256", secret).update(`card:${serial}`).digest("base64url").slice(0, 27);
}

export function signCardToken(serial: string, keys = parseKeys(env().CARD_TOKEN_KEYS)): string {
  const k = keys[0]!;
  return `K${k.kid}.${serial}.${sign(k.secret, serial)}`;
}

/** Returns the serial if the token is authentic, otherwise null. */
export function verifyCardToken(token: string, keys = parseKeys(env().CARD_TOKEN_KEYS)): string | null {
  const m = /^K([a-z0-9]{1,8})\.([A-Za-z0-9]{8,40})\.([A-Za-z0-9_-]{27})$/i.exec(token.trim());
  if (!m) return null;
  const [, kid, serial, sig] = m;
  const key = keys.find((k) => k.kid === kid);
  if (!key) return null;
  const expected = Buffer.from(sign(key.secret, serial!));
  const got = Buffer.from(sig!);
  return expected.length === got.length && timingSafeEqual(expected, got) ? serial! : null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Human-safe random id (no 0/O/1/I). 16 chars ≈ 80 bits. */
export function randomCode(len = 16): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
