import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../client.js";
import { authSessions, organizations, users } from "../schema.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const SESSION_DAYS = 7;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface SessionUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "analyst" | "reviewer";
  orgName: string;
}

export async function createOrgWithOwner(
  db: Db,
  input: { orgName: string; email: string; name: string; password: string },
) {
  return db.transaction(async (tx) => {
    const [org] = await tx.insert(organizations).values({ name: input.orgName }).returning();
    const [user] = await tx
      .insert(users)
      .values({
        orgId: org!.id,
        email: input.email.toLowerCase().trim(),
        name: input.name,
        role: "owner",
        passwordHash: await hashPassword(input.password),
      })
      .returning({ id: users.id });
    return { orgId: org!.id, userId: user!.id };
  });
}

/** Returns a cookie token on success; the same generic failure otherwise. */
export async function login(db: Db, email: string, password: string): Promise<string | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  // Run the hash even for unknown users to keep timing uniform.
  const ok = await verifyPassword(password, user?.passwordHash ?? "scrypt$AAAA$AAAA");
  if (!user || !ok) return null;
  const token = randomBytes(32).toString("base64url");
  await db.insert(authSessions).values({
    tokenHash: sha256(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  return token;
}

export async function userForToken(db: Db, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await db
    .select({
      id: users.id,
      orgId: users.orgId,
      email: users.email,
      name: users.name,
      role: users.role,
      orgName: organizations.name,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .innerJoin(organizations, eq(organizations.id, users.orgId))
    .where(and(eq(authSessions.tokenHash, sha256(token)), gt(authSessions.expiresAt, new Date())));
  return row ?? null;
}

export async function logout(db: Db, token: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.tokenHash, sha256(token)));
}
