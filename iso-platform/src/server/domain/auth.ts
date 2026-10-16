import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { withGlobal, type Db } from "../db";
import { DomainError } from "../errors";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 8;
const LOCK_WINDOW_MIN = 15;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(expected, actual);
}

export const passwordSchema = z
  .string()
  .min(10, "كلمة المرور 10 أحرف على الأقل")
  .max(200)
  .refine((v) => /[A-Za-z؀-ۿ]/.test(v) && /\d/.test(v), "يجب أن تحتوي كلمة المرور على أحرف وأرقام");

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(2).max(120),
  password: passwordSchema,
});

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface SessionInfo {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  locale: "ar" | "en";
  activeOrgId: string | null;
  mustChangePassword: boolean;
}

export async function createUser(db: Db, input: z.input<typeof registerSchema>, mustChange = false) {
  const data = registerSchema.parse(input);
  const exists = await db.query("SELECT 1 FROM users WHERE lower(email) = $1", [data.email]);
  if (exists.rowCount) throw new DomainError("CONFLICT", "البريد الإلكتروني مسجل مسبقاً");
  const { rows } = await db.query(
    `INSERT INTO users (email, full_name, password_hash, must_change_password) VALUES ($1,$2,$3,$4) RETURNING id`,
    [data.email, data.fullName, await hashPassword(data.password), mustChange],
  );
  return rows[0].id as string;
}

export async function register(input: z.input<typeof registerSchema>): Promise<{ userId: string; token: string }> {
  return withGlobal(async (db) => {
    const userId = await createUser(db, input);
    const token = await issueSession(db, userId);
    return { userId, token };
  });
}

async function issueSession(db: Db, userId: string, activeOrgId: string | null = null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, active_org_id, expires_at) VALUES ($1,$2,$3,$4)`,
    [sha256(token), userId, activeOrgId, new Date(Date.now() + SESSION_TTL_MS)],
  );
  return token;
}

export async function login(emailRaw: string, password: string, ip: string | null): Promise<{ token: string; userId: string }> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  return withGlobal(async (db) => {
    const recent = await db.query(
      `SELECT count(*)::int AS n FROM login_attempts
       WHERE lower(email) = $1 AND success = false AND at > now() - make_interval(mins => $2)`,
      [email, LOCK_WINDOW_MIN],
    );
    if (recent.rows[0].n >= MAX_FAILED_LOGINS) {
      throw new DomainError("RATE_LIMITED", "محاولات كثيرة. حاول لاحقاً");
    }
    const { rows } = await db.query("SELECT id, password_hash FROM users WHERE lower(email) = $1", [email]);
    // Always run a hash comparison to keep timing uniform when the user does not exist.
    const ok = rows[0]
      ? await verifyPassword(password, rows[0].password_hash)
      : (await verifyPassword(password, DUMMY_HASH), false);
    if (!ok) throw new DomainError("UNAUTHENTICATED", "بيانات الدخول غير صحيحة");
    await db.query("INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,true)", [email, ip]);
    await db.query("SELECT set_config('app.user_id', $1, true)", [rows[0].id]);
    const membership = await db.query(
      "SELECT org_id FROM memberships WHERE user_id = $1 ORDER BY created_at LIMIT 1",
      [rows[0].id],
    );
    const token = await issueSession(db, rows[0].id, membership.rows[0]?.org_id ?? null);
    return { token, userId: rows[0].id };
  }).catch(async (e) => {
    // login_attempts must persist even when the transaction body threw UNAUTHENTICATED.
    if (e instanceof DomainError && e.code === "UNAUTHENTICATED") {
      await withGlobal((db) => db.query("INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,false)", [email, ip]));
    }
    throw e;
  });
}

const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

export async function getSession(token: string | undefined | null): Promise<SessionInfo | null> {
  if (!token) return null;
  return withGlobal(async (db) => {
    const { rows } = await db.query(
      `SELECT s.id, s.user_id, s.active_org_id, u.email, u.full_name, u.locale, u.must_change_password
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [sha256(token)],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      sessionId: r.id,
      userId: r.user_id,
      email: r.email,
      fullName: r.full_name,
      locale: r.locale,
      activeOrgId: r.active_org_id,
      mustChangePassword: r.must_change_password,
    };
  });
}

export async function setActiveOrg(sessionId: string, userId: string, orgId: string) {
  await withGlobal(async (db) => {
    const m = await db.query("SELECT 1 FROM memberships WHERE org_id = $1 AND user_id = $2", [orgId, userId]);
    if (!m.rowCount) throw new DomainError("FORBIDDEN", "ليست لديك عضوية في هذه المنشأة");
    await db.query("UPDATE sessions SET active_org_id = $1 WHERE id = $2 AND user_id = $3", [orgId, sessionId, userId]);
  }, userId);
}

export async function logout(token: string) {
  await withGlobal((db) => db.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1", [sha256(token)]));
}

export async function changePassword(userId: string, current: string, next: string) {
  const pw = passwordSchema.parse(next);
  await withGlobal(async (db) => {
    const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
    if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) {
      throw new DomainError("UNAUTHENTICATED", "كلمة المرور الحالية غير صحيحة");
    }
    await db.query("UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2", [await hashPassword(pw), userId]);
    await db.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
  });
}
