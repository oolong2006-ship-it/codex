import { z } from "zod";
import { one, q, tx, pool } from "../db";
import { AppError } from "../errors";
import { requirePermission, type Actor } from "../actor";
import { PERMISSIONS, ROLES } from "../rbac";
import { audit } from "../audit";
import { enqueue, scheduleDrain } from "../outbox";
import { hashPassword, hashPin, verifyPin } from "../password";
import { designSchema, parseDesign, type CardDesign } from "./design";

// ── Programs ────────────────────────────────────────────────────────────────

export type Program = {
  id: string;
  slug: string;
  name: string;
  stampsRequired: number;
  rewardDescription: string;
  cooldownMinutes: number;
  maxStampsPerScan: number;
  welcomeStamps: number;
  terms: string | null;
  design: CardDesign;
  active: boolean;
};

export async function getProgram(actor: Actor): Promise<Program> {
  requirePermission(actor, PERMISSIONS.DASHBOARD_VIEW);
  const r = await one<Omit<Program, "design"> & { design: unknown }>(
    `SELECT id, slug, name, stamps_required AS "stampsRequired", reward_description AS "rewardDescription",
            cooldown_minutes AS "cooldownMinutes", max_stamps_per_scan AS "maxStampsPerScan", welcome_stamps AS "welcomeStamps",
            terms, design, active
     FROM loyalty_programs WHERE merchant_id = $1 ORDER BY created_at LIMIT 1`,
    [actor.merchantId],
  );
  if (!r) throw new AppError("errors.notFound", 404);
  return { ...r, design: parseDesign(r.design) };
}

export const programSchema = z.object({
  name: z.string().trim().min(2).max(60),
  stampsRequired: z.coerce.number().int().min(2).max(30),
  rewardDescription: z.string().trim().min(2).max(80),
  cooldownMinutes: z.coerce.number().int().min(0).max(1440),
  maxStampsPerScan: z.coerce.number().int().min(1).max(10),
  welcomeStamps: z.coerce.number().int().min(0).max(5),
  terms: z.string().trim().max(1000).optional().transform((v) => (v ? v : null)),
  active: z.boolean(),
  design: designSchema,
});

export async function updateProgram(actor: Actor, input: z.input<typeof programSchema>): Promise<void> {
  requirePermission(actor, PERMISSIONS.PROGRAM_MANAGE);
  const d = programSchema.parse(input);
  await tx(async (db, onCommit) => {
    const p = await one<{ id: string }>(`SELECT id FROM loyalty_programs WHERE merchant_id = $1 ORDER BY created_at LIMIT 1 FOR UPDATE`, [actor.merchantId], db);
    if (!p) throw new AppError("errors.notFound", 404);
    await db.query(
      `UPDATE loyalty_programs SET name=$2, stamps_required=$3, reward_description=$4, cooldown_minutes=$5, max_stamps_per_scan=$6,
              welcome_stamps=$7, terms=$8, active=$9, design=$10, updated_at=now()
       WHERE id = $1 AND merchant_id = $11`,
      [p.id, d.name, d.stampsRequired, d.rewardDescription, d.cooldownMinutes, d.maxStampsPerScan, d.welcomeStamps, d.terms, d.active, JSON.stringify(d.design), actor.merchantId],
    );
    await audit(db, actor, "program.update", "program", p.id, { stampsRequired: d.stampsRequired, active: d.active });
    await enqueue(db, "wallet.program_changed", { programId: p.id });
    onCommit(scheduleDrain);
  });
}

// ── Branches ────────────────────────────────────────────────────────────────

export type Branch = { id: string; name: string; city: string | null; active: boolean };

export async function listBranches(actor: Actor, onlyActive = false): Promise<Branch[]> {
  return q<Branch>(
    `SELECT id, name, city, active FROM branches WHERE merchant_id = $1 ${onlyActive ? "AND active" : ""} ORDER BY created_at`,
    [actor.merchantId],
  );
}

export const branchSchema = z.object({ name: z.string().trim().min(2).max(80), city: z.string().trim().max(60).optional() });

export async function createBranch(actor: Actor, input: z.input<typeof branchSchema>) {
  requirePermission(actor, PERMISSIONS.BRANCH_MANAGE);
  const d = branchSchema.parse(input);
  const b = await one<{ id: string }>(`INSERT INTO branches(merchant_id, name, city) VALUES ($1,$2,$3) RETURNING id`, [actor.merchantId, d.name, d.city || null]);
  await audit(pool(), actor, "branch.create", "branch", b!.id, { name: d.name });
  return b!.id;
}

export async function setBranchActive(actor: Actor, branchId: string, active: boolean) {
  requirePermission(actor, PERMISSIONS.BRANCH_MANAGE);
  const r = await pool().query(`UPDATE branches SET active = $3 WHERE id = $1 AND merchant_id = $2`, [branchId, actor.merchantId, active]);
  if (r.rowCount === 0) throw new AppError("errors.notFound", 404);
  await audit(pool(), actor, active ? "branch.activate" : "branch.deactivate", "branch", branchId);
}

// ── Staff ───────────────────────────────────────────────────────────────────

export type StaffMember = { id: string; name: string; email: string | null; role: (typeof ROLES)[number]; branchId: string | null; branchName: string | null; active: boolean; hasPin: boolean };

export async function listStaff(actor: Actor): Promise<StaffMember[]> {
  requirePermission(actor, PERMISSIONS.STAFF_MANAGE);
  return q<StaffMember>(
    `SELECT s.id, s.name, s.email, s.role, s.branch_id AS "branchId", b.name AS "branchName", s.active, (s.pin_hash IS NOT NULL) AS "hasPin"
     FROM staff_users s LEFT JOIN branches b ON b.id = s.branch_id
     WHERE s.merchant_id = $1 ORDER BY s.created_at`,
    [actor.merchantId],
  );
}

export const staffSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    role: z.enum(ROLES),
    branchId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    email: z.string().trim().toLowerCase().email().optional().or(z.literal("").transform(() => undefined)),
    password: z.string().optional().or(z.literal("").transform(() => undefined)),
    pin: z.string().regex(/^\d{4,6}$/).optional().or(z.literal("").transform(() => undefined)),
  })
  .superRefine((v, ctx) => {
    if (v.role !== "CASHIER" && (!v.email || !v.password)) ctx.addIssue({ code: "custom", path: ["email"], message: "errors.invalidInput" });
    if (v.password && v.password.length < 10) ctx.addIssue({ code: "custom", path: ["password"], message: "errors.weakPassword" });
    if (v.role === "CASHIER" && !v.pin) ctx.addIssue({ code: "custom", path: ["pin"], message: "errors.invalidInput" });
  });

export async function createStaff(actor: Actor, input: z.input<typeof staffSchema>) {
  requirePermission(actor, PERMISSIONS.STAFF_MANAGE);
  const parsed = staffSchema.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message.startsWith("errors.") ? parsed.error.issues[0].message : "errors.invalidInput");
  const d = parsed.data;
  return tx(async (db) => {
    if (d.branchId && !(await one(`SELECT 1 FROM branches WHERE id = $1 AND merchant_id = $2`, [d.branchId, actor.merchantId], db))) {
      throw new AppError("errors.notFound", 404);
    }
    if (d.email && (await one(`SELECT 1 FROM staff_users WHERE email = $1`, [d.email], db))) throw new AppError("errors.emailTaken");
    if (d.pin) {
      // PINs must be unique within a merchant (the PIN identifies the cashier).
      const others = await q<{ pin_hash: string }>(`SELECT pin_hash FROM staff_users WHERE merchant_id = $1 AND pin_hash IS NOT NULL AND active`, [actor.merchantId], db);
      for (const o of others) if (await verifyPin(d.pin, o.pin_hash)) throw new AppError("errors.pinTaken");
    }
    const u = await one<{ id: string }>(
      `INSERT INTO staff_users(merchant_id, branch_id, name, email, password_hash, pin_hash, role) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [actor.merchantId, d.branchId ?? null, d.name, d.email ?? null, d.password ? await hashPassword(d.password) : null, d.pin ? await hashPin(d.pin) : null, d.role],
      db,
    );
    await audit(db, actor, "staff.create", "staff", u!.id, { role: d.role });
    return u!.id;
  });
}

export async function setStaffActive(actor: Actor, staffId: string, active: boolean) {
  requirePermission(actor, PERMISSIONS.STAFF_MANAGE);
  await tx(async (db) => {
    const s = await one<{ role: string }>(`SELECT role FROM staff_users WHERE id = $1 AND merchant_id = $2 FOR UPDATE`, [staffId, actor.merchantId], db);
    if (!s) throw new AppError("errors.notFound", 404);
    if (!active && s.role === "OWNER") {
      const owners = await one<{ n: number }>(`SELECT count(*)::int AS n FROM staff_users WHERE merchant_id = $1 AND role = 'OWNER' AND active`, [actor.merchantId], db);
      if ((owners?.n ?? 0) <= 1) throw new AppError("errors.lastOwner");
    }
    await db.query(`UPDATE staff_users SET active = $3 WHERE id = $1 AND merchant_id = $2`, [staffId, actor.merchantId, active]);
    if (!active) await db.query(`DELETE FROM sessions WHERE staff_user_id = $1`, [staffId]);
    await audit(db, actor, active ? "staff.activate" : "staff.deactivate", "staff", staffId);
  });
}

// ── Merchant ────────────────────────────────────────────────────────────────

export async function getMerchant(actor: Actor) {
  const m = await one<{ id: string; slug: string; name: string; plan: string }>(`SELECT id, slug, name, plan FROM merchants WHERE id = $1`, [actor.merchantId]);
  if (!m) throw new AppError("errors.notFound", 404);
  return m;
}

// ── Activity log ────────────────────────────────────────────────────────────

export async function listActivity(actor: Actor, limit = 100) {
  requirePermission(actor, PERMISSIONS.STAFF_MANAGE);
  return q<{ id: string; action: string; entity: string | null; entity_id: string | null; created_at: Date; staff_name: string | null }>(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.created_at, s.name AS staff_name
     FROM audit_log a LEFT JOIN staff_users s ON s.id = a.staff_user_id
     WHERE a.merchant_id = $1 ORDER BY a.created_at DESC LIMIT $2`,
    [actor.merchantId, limit],
  );
}
