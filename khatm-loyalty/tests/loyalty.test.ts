import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, makeMerchant, makeCard, backdateLastStamp, one } from "./helpers";
import { addStamps, lookupCard, redeemReward } from "@/server/domain/stamping";
import { enroll } from "@/server/domain/enrollment";
import { signCardToken } from "@/server/tokens";
import { AppError } from "@/server/errors";
import { updateProgram, getProgram, createStaff, setStaffActive, listStaff } from "@/server/domain/management";
import { loginWithPin, actorFromToken, loginWithPassword } from "@/server/domain/accounts";
import { drainOutbox } from "@/server/outbox";
import { setWalletProvider } from "@/server/wallet";
import { MockWalletProvider } from "@/server/wallet/mock";
import { pool } from "@/server/db";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
};

beforeEach(resetDb);

describe("enrollment", () => {
  it("creates a card and applies welcome stamps", async () => {
    const m = await makeMerchant();
    const program = await getProgram(m.owner);
    await updateProgram(m.owner, { ...program, welcomeStamps: 2, terms: program.terms ?? undefined });
    const card = await makeCard(m.slug);
    const s = await lookupCard(m.cashier, { token: signCardToken(card.serial) });
    expect(s.currentStamps).toBe(2);
    expect(s.cooldownRemainingMinutes).toBe(0);
  });

  it("never reveals an existing card; sends the link to the phone instead", async () => {
    const m = await makeMerchant();
    await makeCard(m.slug, "0551112222");
    const again = await enroll({ programSlug: m.slug, name: "متطفل", phone: "+966551112222", consent: true }, "ip-x");
    expect(again).toEqual({ kind: "existing_sent" });
    const job = await one<{ payload: { to: string; body: string } }>(`SELECT payload FROM outbox_jobs WHERE kind = 'message.send'`);
    expect(job!.payload.to).toBe("+966551112222");
    expect(job!.payload.body).toContain("/c/");
  });

  it("requires consent and a valid phone", async () => {
    const m = await makeMerchant();
    expect(await code(enroll({ programSlug: m.slug, name: "علي", phone: "0551234567", consent: false as unknown as true }, "ip"))).toBe("errors.consentRequired");
    expect(await code(enroll({ programSlug: m.slug, name: "علي", phone: "12345", consent: true }, "ip"))).toBe("errors.invalidPhone");
  });

  it("rate-limits enrollment per IP", async () => {
    const m = await makeMerchant();
    for (let i = 0; i < 20; i++) await enroll({ programSlug: m.slug, name: "عميل", phone: `05500000${String(i).padStart(2, "0")}`, consent: true }, "same-ip");
    expect(await code(enroll({ programSlug: m.slug, name: "عميل", phone: "0559999999", consent: true }, "same-ip"))).toBe("errors.rateLimited");
  });
});

describe("stamping & rewards", () => {
  it("full cycle: stamps → reward → redeem", async () => {
    const m = await makeMerchant();
    const program = await getProgram(m.owner);
    await updateProgram(m.owner, { ...program, stampsRequired: 3, cooldownMinutes: 0, terms: undefined });
    const card = await makeCard(m.slug);
    await addStamps(m.cashier, card.serial, 1);
    await addStamps(m.cashier, card.serial, 1);
    const third = await addStamps(m.cashier, card.serial, 1);
    expect(third.rewardsEarned).toBe(1);
    expect(third.currentStamps).toBe(0);
    expect(third.rewardsAvailable).toBe(1);
    const red = await redeemReward(m.cashier, card.serial);
    expect(red.rewardsAvailable).toBe(0);
    expect(await code(redeemReward(m.cashier, card.serial))).toBe("errors.noReward");
    const events = await one<{ n: number }>(`SELECT count(*)::int AS n FROM stamp_events WHERE card_id IS NOT NULL`);
    expect(events!.n).toBe(3);
  });

  it("enforces cooldown and max stamps per scan", async () => {
    const m = await makeMerchant();
    const card = await makeCard(m.slug);
    await addStamps(m.cashier, card.serial, 1);
    expect(await code(addStamps(m.cashier, card.serial, 1))).toBe("errors.cooldown");
    await backdateLastStamp(card.serial, 31);
    expect(await code(addStamps(m.cashier, card.serial, 1))).toBe("ok");
    await backdateLastStamp(card.serial, 31);
    expect(await code(addStamps(m.cashier, card.serial, 4))).toBe("errors.tooManyStamps");
  });

  it("is safe under concurrent double-taps (row lock + cooldown)", async () => {
    const m = await makeMerchant();
    const card = await makeCard(m.slug);
    const results = await Promise.all([1, 2, 3, 4].map(() => code(addStamps(m.cashier, card.serial, 1))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    const c = await one<{ total_stamps: number }>(`SELECT total_stamps FROM cards WHERE serial_number = $1`, [card.serial]);
    expect(c!.total_stamps).toBe(1);
  });

  it("rejects forged barcodes and paused programs", async () => {
    const m = await makeMerchant();
    const card = await makeCard(m.slug);
    expect(await code(lookupCard(m.cashier, { token: `K1.${card.serial}.AAAAAAAAAAAAAAAAAAAAAAAAAAA` }))).toBe("errors.invalidCard");
    const program = await getProgram(m.owner);
    await updateProgram(m.owner, { ...program, active: false, terms: undefined });
    expect(await code(addStamps(m.cashier, card.serial, 1))).toBe("errors.programInactive");
  });

  it("cashier cannot manage the program", async () => {
    const m = await makeMerchant();
    const program = await getProgram(m.owner);
    expect(await code(updateProgram(m.cashier, { ...program, terms: undefined }))).toBe("errors.forbidden");
  });
});

describe("tenant isolation", () => {
  it("a cashier can never see or stamp another merchant's card", async () => {
    const a = await makeMerchant("alpha");
    const b = await makeMerchant("beta");
    const cardB = await makeCard(b.slug, "0557778888");
    expect(await code(lookupCard(a.cashier, { token: signCardToken(cardB.serial) }))).toBe("errors.invalidCard");
    expect(await code(lookupCard(a.cashier, { phone: "0557778888" }))).toBe("errors.invalidCard");
    expect(await code(addStamps(a.cashier, cardB.serial, 1))).toBe("errors.invalidCard");
    expect(await code(redeemReward(a.owner, cardB.serial))).toBe("errors.invalidCard");
    const staffA = await listStaff(a.owner);
    expect(staffA.every((s) => s.name !== undefined)).toBe(true);
    const staffB = await listStaff(b.owner);
    expect(await code(setStaffActive(a.owner, staffB[0]!.id, false))).toBe("errors.notFound");
  });

  it("the same phone gets separate customers per merchant", async () => {
    const a = await makeMerchant("alpha");
    const b = await makeMerchant("beta");
    await makeCard(a.slug, "0551231231");
    const second = await enroll({ programSlug: b.slug, name: "نفس الرقم", phone: "0551231231", consent: true }, "ip-2");
    expect(second.kind).toBe("created");
  });
});

describe("auth", () => {
  it("cashier PIN login binds the single branch automatically", async () => {
    const m = await makeMerchant();
    const pinOwner = await createStaff(m.owner, { name: "كاشير ٢", role: "CASHIER", pin: "482913" });
    expect(pinOwner).toBeTruthy();
    const r = await loginWithPin(m.slug, "482913", "1.1.1.1");
    expect(r.needsBranch).toBe(false);
    const actor = await actorFromToken(r.token, "staff");
    expect(actor?.branchId).toBe(m.branchId);
    expect(await actorFromToken(r.token, "dashboard")).toBeNull();
    expect(await code(loginWithPin(m.slug, "000000", "1.1.1.1"))).toBe("errors.invalidPin");
  });

  it("rejects duplicate PINs within a merchant and deactivated users lose sessions", async () => {
    const m = await makeMerchant();
    const id = await createStaff(m.owner, { name: "أحمد", role: "CASHIER", pin: "777777" });
    expect(await code(createStaff(m.owner, { name: "بدر", role: "CASHIER", pin: "777777" }))).toBe("errors.pinTaken");
    const { token } = await loginWithPin(m.slug, "777777", "2.2.2.2");
    await setStaffActive(m.owner, id, false);
    expect(await actorFromToken(token, "staff")).toBeNull();
  });

  it("password login and last-owner protection", async () => {
    const m = await makeMerchant();
    expect(await code(loginWithPassword(`${m.slug}@example.com`, "wrong-password!!", "3.3.3.3"))).toBe("errors.invalidCredentials");
    const token = await loginWithPassword(`${m.slug}@example.com`, "very-strong-password", "3.3.3.3");
    expect(token).toBeTruthy();
    expect(await code(setStaffActive(m.owner, m.owner.staffUserId, false))).toBe("errors.lastOwner");
  });
});

describe("outbox → wallet", () => {
  it("pushes committed card changes to the wallet provider", async () => {
    const mock = new MockWalletProvider();
    setWalletProvider(mock);
    const m = await makeMerchant();
    const card = await makeCard(m.slug);
    await addStamps(m.cashier, card.serial, 2);
    const n = await drainOutbox();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(mock.log.some((l) => l.includes(`card ${card.serial}: 2/`))).toBe(true);
    const pending = await one<{ n: number }>(`SELECT count(*)::int AS n FROM outbox_jobs WHERE done_at IS NULL`);
    expect(pending!.n).toBe(0);
  });

  it("does not enqueue anything when the transaction fails", async () => {
    const m = await makeMerchant();
    const card = await makeCard(m.slug);
    await addStamps(m.cashier, card.serial, 1);
    const before = await one<{ n: number }>(`SELECT count(*)::int AS n FROM outbox_jobs`);
    await code(addStamps(m.cashier, card.serial, 1)); // cooldown → rollback
    const after = await one<{ n: number }>(`SELECT count(*)::int AS n FROM outbox_jobs`);
    expect(after!.n).toBe(before!.n);
    await pool().query("SELECT 1");
  });
});
