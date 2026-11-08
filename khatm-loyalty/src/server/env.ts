import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3200"),
  CARD_TOKEN_KEYS: z.string().min(1),
  WALLET_PROVIDER: z.enum(["mock", "live"]).default("mock"),
  APPLE_PASS_TYPE_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_PASS_CERT_PEM_PATH: z.string().optional(),
  APPLE_PASS_KEY_PEM_PATH: z.string().optional(),
  APPLE_PASS_KEY_PASSPHRASE: z.string().optional(),
  APPLE_WWDR_CERT_PEM_PATH: z.string().optional(),
  APPLE_APNS_HOST: z.string().default("api.push.apple.com"),
  GOOGLE_WALLET_ISSUER_ID: z.string().optional(),
  GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_PATH: z.string().optional(),
  MESSAGING_PROVIDER: z.enum(["console", "whatsapp"]).default("console"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated environment. Empty strings are treated as unset. */
export function env(): Env {
  if (cached) return cached;
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid environment: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = null;
}
