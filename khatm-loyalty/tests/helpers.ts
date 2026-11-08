import { pool, one } from "@/server/db";
import { signup, actorFromToken } from "@/server/domain/accounts";
import { createStaff, listBranches } from "@/server/domain/management";
import type { Actor } from "@/server/actor";
import { enroll } from "@/server/domain/enrollment";

let n = 0;

export async function resetDb() {
  await pool().query(`TRUNCATE merchants, rate_limits, outbox_jobs RESTART IDENTITY CASCADE`);
}

/** Creates a merchant with an owner and a cashier bound to the first branch. */
export async function makeMerchant(prefix = "cafe"): Promise<{ owner: Actor; cashier: Actor; branchId: string; slug: string }> {
  n++;
  const slug = `${prefix}-${n}-${Date.now() % 100000}`;
  const { token } = await signup({
    businessName: `مقهى ${n}`,
    slug,
    ownerName: "مالك",
    email: `${slug}@example.com`,
    password: "very-strong-password",
    branchName: "الفرع الرئيسي",
  });
  const owner = (await actorFromToken(token, "dashboard"))!;
  const [branch] = await listBranches(owner);
  owner.branchId = branch!.id;
  const cashierId = await createStaff(owner, { name: "كاشير", role: "CASHIER", branchId: branch!.id, pin: String(1000 + n) });
  const cashier: Actor = { staffUserId: cashierId, merchantId: owner.merchantId, role: "CASHIER", name: "كاشير", branchId: branch!.id };
  return { owner, cashier, branchId: branch!.id, slug };
}

export async function makeCard(slug: string, phone = "0551234567", name = "سارة القحطاني") {
  const r = await enroll({ programSlug: slug, name, phone, consent: true, marketingOptIn: true }, `ip-${Math.random()}`);
  if (r.kind !== "created") throw new Error("expected new card");
  return r;
}

export async function backdateLastStamp(serial: string, minutes: number) {
  await pool().query(`UPDATE cards SET last_stamp_at = now() - make_interval(mins => $2) WHERE serial_number = $1`, [serial, minutes]);
}

export { one };
