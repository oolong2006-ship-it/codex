import { existsSync } from "node:fs";
import path from "node:path";

const envFile = path.join(__dirname, "..", ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? (process.env.DATABASE_URL ?? "").replace(/\/khatm(\?|$)/, "/khatm_test$1");
process.env.OUTBOX_AUTODRAIN = "0";
process.env.WALLET_PROVIDER = "mock";
process.env.MESSAGING_PROVIDER = "console";
process.env.CARD_TOKEN_KEYS ||= "1:test-secret-test-secret-test-secret-123";
