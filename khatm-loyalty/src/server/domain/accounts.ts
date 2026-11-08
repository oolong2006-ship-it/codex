import { z } from "zod";
import { one, tx, type Db, pool } from "../db";
import { AppError } from "../errors";
import { hashPassword, verifyPassword, verifyPin } from "../password";
import { rateLimit } from "../rate-limit";
import { audit } from "../audit";
import { createHash, randomBytes } from "node:crypto";
import type { Actor } from "../actor";
import type { Role } from "../rbac";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{2,40}$/);

export const signupSchema = z.object({
  businessName: z.string().trim().min(2).max(80),
  slug: slugSchema,
  ownerName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(200),
  branchName: z.string().trim().min(2).max(80),
  city: z.string().trim().max(60).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;

const SESSION_DAYS = { dashboard: 14, staff: 30 } as const;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function signup(input: SignupInput): Promise<{ merchantId: string; staffUserId: string; token: string }> {
  const data = signupSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  return tx(async (db) => {
    if (await one(`SELECT 1 FROM merchants WHERE slug = $1`, [data.slug], db)) throw new AppError("errors.slugTaken");
    if (await one(`SELECT 1 FROM staff_users WHERE email = $1`, [data.email], db)) throw new AppError("errors.emailTaken");
    const m = await one<{ id: string }>(`INSERT INTO merchants(slug, name) VALUES ($1,$2) RETURNING id`, [data.slug, data.businessName], db);
    const merchantId = m!.id;
    await db.query(`INSERT INTO branches(merchant_id, name, city) VALUES ($1,$2,$3)`, [merchantId, data.branchName, data.city ?? null]);
    const u = await one<{ id: string }>(
      `INSERT INTO staff_users(merchant_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,'OWNER') RETURNING id`,
      [merchantId, data.ownerName, data.email, passwordHash],
      db,
    );
    // Sensible default program so the merchant can go live immediately.
    await db.query(
      `INSERT INTO loyalty_programs(merchant_id, slug, name, stamps_required, reward_description)
       VALUES ($1, $2, $3, 9, 'مشروب مجاني')`,
      [merchantId, data.slug, data.businessName],
    );
    const token = await createSession(db, u!.id, "dashboard", null);
    await audit(db, { merchantId, staffUserId: u!.id }, "merchant.signup", "merchant", merchantId);
    return { merchantId, staffUserId: u!.id, token };
  });
}

export async function createSession(db: Db, staffUserId: string, kind: "dashboard" | "staff", branchId: string | null) {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    `INSERT INTO sessions(token_hash, staff_user_id, kind, branch_id, expires_at)
     VALUES ($1,$2,$3,$4, now() + make_interval(days => $5))`,
    [hashToken(token), staffUserId, kind, branchId, SESSION_DAYS[kind]],
  );
  return token;
}

export async function loginWithPassword(emailRaw: string, password: string, ip: string): Promise<string> {
  const email = emailRaw.trim().toLowerCase();
  await rateLimit(`login:ip:${ip}`, 20, 600);
  await rateLimit(`login:email:${email}`, 8, 600);
  const u = await one<{ id: string; password_hash: string | null; merchant_id: string }>(
    `SELECT id, password_hash, merchant_id FROM staff_users
     WHERE email = $1 AND active AND role IN ('OWNER','MANAGER')`,
    [email],
  );
  // Constant-ish time: always run bcrypt.
  const ok = await verifyPassword(password, u?.password_hash ?? "$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
  if (!u || !ok) throw new AppError("errors.invalidCredentials", 401);
  const token = await createSession(pool(), u.id, "dashboard", null);
  await audit(pool(), { merchantId: u.merchant_id, staffUserId: u.id }, "auth.login");
  return token;
}

/**
 * Cashier device sign-in: business code (merchant slug) + PIN.
 * PINs are unique per merchant; brute force is capped per merchant and per IP.
 */
export async function loginWithPin(slugRaw: string, pin: string, ip: string): Promise<{ token: string; needsBranch: boolean }> {
  const slug = slugRaw.trim().toLowerCase();
  if (!/^\d{4,6}$/.test(pin)) throw new AppError("errors.invalidPin", 401);
  await rateLimit(`pin:ip:${ip}`, 15, 600);
  await rateLimit(`pin:merchant:${slug}`, 30, 600);
  const candidates = await pool().query<{ id: string; pin_hash: string; branch_id: string | null; merchant_id: string }>(
    `SELECT s.id, s.pin_hash, s.branch_id, s.merchant_id FROM staff_users s
     JOIN merchants m ON m.id = s.merchant_id
     WHERE m.slug = $1 AND s.active AND s.pin_hash IS NOT NULL`,
    [slug],
  );
  for (const c of candidates.rows) {
    if (await verifyPin(pin, c.pin_hash)) {
      const branchCount = await one<{ n: number }>(`SELECT count(*)::int AS n FROM branches WHERE merchant_id = $1 AND active`, [c.merchant_id]);
      let branchId = c.branch_id;
      if (!branchId && branchCount?.n === 1) {
        branchId = (await one<{ id: string }>(`SELECT id FROM branches WHERE merchant_id = $1 AND active`, [c.merchant_id]))!.id;
      }
      const token = await createSession(pool(), c.id, "staff", branchId);
      await audit(pool(), { merchantId: c.merchant_id, staffUserId: c.id }, "auth.pin_login");
      return { token, needsBranch: !branchId };
    }
  }
  throw new AppError("errors.invalidPin", 401);
}

type SessionRow = {
  staff_user_id: string;
  merchant_id: string;
  role: Role;
  name: string;
  kind: "dashboard" | "staff";
  branch_id: string | null;
};

export async function actorFromToken(token: string | undefined, kind: "dashboard" | "staff" | "any"): Promise<(Actor & { sessionKind: "dashboard" | "staff" }) | null> {
  if (!token) return null;
  const row = await one<SessionRow>(
    `SELECT s.staff_user_id, u.merchant_id, u.role, u.name, s.kind, s.branch_id
     FROM sessions s JOIN staff_users u ON u.id = s.staff_user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`,
    [hashToken(token)],
  );
  if (!row) return null;
  if (kind !== "any" && row.kind !== kind) return null;
  return {
    staffUserId: row.staff_user_id,
    merchantId: row.merchant_id,
    role: row.role,
    name: row.name,
    branchId: row.branch_id,
    sessionKind: row.kind,
  };
}

export async function setSessionBranch(token: string, actor: Actor, branchId: string) {
  const b = await one(`SELECT 1 FROM branches WHERE id = $1 AND merchant_id = $2 AND active`, [branchId, actor.merchantId]);
  if (!b) throw new AppError("errors.notFound", 404);
  await pool().query(`UPDATE sessions SET branch_id = $1 WHERE token_hash = $2`, [branchId, hashToken(token)]);
}

export async function destroySession(token: string | undefined) {
  if (token) await pool().query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
}
