import { eq } from "drizzle-orm";
import { createDb } from "./client.js";
import { createOrgWithOwner } from "./repos/auth.js";
import { users } from "./schema.js";

/** Creates the first organization and owner from SEED_* variables (idempotent). */
const email = process.env.SEED_EMAIL;
const password = process.env.SEED_PASSWORD;
if (!email || !password || password.length < 12) {
  console.error("Set SEED_EMAIL and SEED_PASSWORD (12+ characters).");
  process.exit(1);
}
const handle = createDb();
const [existing] = await handle.db.select().from(users).where(eq(users.email, email.toLowerCase()));
if (existing) {
  console.log("owner already exists");
} else {
  await createOrgWithOwner(handle.db, {
    orgName: process.env.SEED_ORG_NAME ?? "مجلس",
    email,
    name: process.env.SEED_NAME ?? "Owner",
    password,
  });
  console.log("organization and owner created");
}
await handle.close();
