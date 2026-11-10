import "./load-env";
import { Client } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

/**
 * Demo data (development only): one café with two branches, staff, a program
 * and 24 customers with 12 weeks of realistic visit history — including
 * at-risk regulars and unredeemed rewards — so every dashboard view has data.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = (n = 16) => Array.from(randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join("");

const NAMES = [
  "سارة القحطاني", "محمد العتيبي", "نورة الشهري", "عبدالله الدوسري", "ريم الحربي", "فيصل الغامدي", "لمى الزهراني", "خالد المطيري",
  "هيا السبيعي", "تركي العنزي", "جود الشمري", "سلطان القرني", "دانة البقمي", "يوسف الرشيدي", "أروى الأحمدي", "بندر العمري",
  "منيرة الحارثي", "نايف الجهني", "شهد اليامي", "ماجد السهلي", "رهف الخالدي", "عمر البلوي", "غادة المالكي", "سعود الشهراني",
];

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10) throw new Error("SEED_PASSWORD (10+ chars) is required");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  if (process.env.SEED_IF_EMPTY === "1" && (await db.query(`SELECT 1 FROM merchants WHERE slug = 'brew-house'`)).rowCount) {
    console.log("seed: demo merchant already exists, skipping");
    await db.end();
    return;
  }
  await db.query("BEGIN");
  await db.query(`DELETE FROM merchants WHERE slug = 'brew-house'`);

  const m = (await db.query<{ id: string }>(`INSERT INTO merchants(slug, name, name_en, plan) VALUES ('brew-house','محمصة البن العربي','Arabian Brew House','pro') RETURNING id`)).rows[0]!.id;
  const b1 = (await db.query<{ id: string }>(`INSERT INTO branches(merchant_id, name, city) VALUES ($1,'فرع العليا','الرياض') RETURNING id`, [m])).rows[0]!.id;
  const b2 = (await db.query<{ id: string }>(`INSERT INTO branches(merchant_id, name, city) VALUES ($1,'فرع التحلية','جدة') RETURNING id`, [m])).rows[0]!.id;
  const pw = await bcrypt.hash(password, 11);
  const owner = (await db.query<{ id: string }>(`INSERT INTO staff_users(merchant_id, name, email, password_hash, role, pin_hash) VALUES ($1,'عبدالرحمن (المالك)','owner@khatm.dev',$2,'OWNER',$3) RETURNING id`, [m, pw, await bcrypt.hash("9999", 10)])).rows[0]!.id;
  await db.query(`INSERT INTO staff_users(merchant_id, name, email, password_hash, role) VALUES ($1,'هند (مديرة)','manager@khatm.dev',$2,'MANAGER')`, [m, pw]);
  const c1 = (await db.query<{ id: string }>(`INSERT INTO staff_users(merchant_id, branch_id, name, role, pin_hash) VALUES ($1,$2,'أحمد','CASHIER',$3) RETURNING id`, [m, b1, await bcrypt.hash("1234", 10)])).rows[0]!.id;
  const c2 = (await db.query<{ id: string }>(`INSERT INTO staff_users(merchant_id, branch_id, name, role, pin_hash) VALUES ($1,$2,'مها','CASHIER',$3) RETURNING id`, [m, b2, await bcrypt.hash("5678", 10)])).rows[0]!.id;
  const p = (await db.query<{ id: string }>(
    `INSERT INTO loyalty_programs(merchant_id, slug, name, stamps_required, reward_description, cooldown_minutes, max_stamps_per_scan, welcome_stamps, terms, design)
     VALUES ($1,'brew-house','بطاقة القهوة',9,'قهوة مختصة مجانية بأي حجم',30,3,1,'ختم واحد لكل مشروب. المكافأة صالحة في جميع الفروع ولا تُستبدل نقداً.',$2) RETURNING id`,
    [m, JSON.stringify({ bg: "#6D4AFF", fg: "#FFFFFF", accent: "#FFC233", icon: "☕" })],
  )).rows[0]!.id;

  // Visit rhythms (days between visits); some regulars have stopped coming.
  let rng = 42;
  const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < NAMES.length; i++) {
    const phone = `+9665${String(50000000 + i * 137731).slice(0, 8)}`;
    const cust = (await db.query<{ id: string }>(
      `INSERT INTO customers(merchant_id, name, phone, consent_at, marketing_opt_in, created_at) VALUES ($1,$2,$3, now() - interval '90 days', $4, now() - interval '90 days') RETURNING id`,
      [m, NAMES[i], phone, i % 4 !== 3],
    )).rows[0]!.id;
    const card = (await db.query<{ id: string }>(
      `INSERT INTO cards(merchant_id, program_id, customer_id, serial_number, auth_token, created_at) VALUES ($1,$2,$3,$4,$5, now() - interval '90 days') RETURNING id`,
      [m, p, cust, code(), randomBytes(24).toString("base64url")],
    )).rows[0]!.id;
    const rhythm = [2, 3, 4, 6, 9][i % 5]!;
    const stoppedDaysAgo = i % 6 === 0 ? 25 + (i % 3) * 10 : 0; // at-risk regulars
    let day = 84 - Math.floor(rand() * 10);
    let total = 0;
    while (day > stoppedDaysAgo) {
      const branch = rand() < 0.65 ? b1 : b2;
      const staff = branch === b1 ? c1 : c2;
      const qty = rand() < 0.15 ? 2 : 1;
      await db.query(
        `INSERT INTO stamp_events(merchant_id, card_id, branch_id, staff_user_id, quantity, source, created_at)
         VALUES ($1,$2,$3,$4,$5,'STAFF', now() - make_interval(days => $6, hours => $7))`,
        [m, card, branch, staff, qty, day, Math.floor(rand() * 10)],
      );
      total += qty;
      day -= Math.max(1, Math.round(rhythm * (0.6 + rand() * 0.8)));
    }
    const earned = Math.floor(total / 9);
    const redeemed = Math.max(0, earned - (i % 3 === 0 ? 1 : 0));
    for (let r = 0; r < redeemed; r++) {
      await db.query(
        `INSERT INTO redemptions(merchant_id, card_id, branch_id, staff_user_id, reward_description, created_at) VALUES ($1,$2,$3,$4,'قهوة مختصة مجانية بأي حجم', now() - make_interval(days => $5))`,
        [m, card, b1, c1, Math.max(stoppedDaysAgo + 1, Math.floor(rand() * 60))],
      );
    }
    await db.query(
      `UPDATE cards SET current_stamps = $2, rewards_available = $3, cycles_completed = $4, total_stamps = $5,
              last_stamp_at = (SELECT max(created_at) FROM stamp_events WHERE card_id = $1), updated_at = now()
       WHERE id = $1`,
      [card, total % 9, earned - redeemed, earned, total],
    );
  }
  await db.query(`INSERT INTO audit_log(merchant_id, staff_user_id, action, entity, entity_id) VALUES ($1,$2,'demo.seed','merchant',$3)`, [m, owner, m]);
  await db.query("COMMIT");
  await db.end();
  console.log(`seeded brew-house:
  dashboard  owner@khatm.dev / manager@khatm.dev  (password: SEED_PASSWORD)
  cashier    business code "brew-house", PIN 1234 (Olaya) or 5678 (Tahlia), owner PIN 9999
  join page  /join/brew-house`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
