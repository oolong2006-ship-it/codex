/**
 * End-to-end journey on real services: PostgreSQL, the voice gateway (mock
 * models) and the built web app, driven by Chromium.
 *
 *   create study → open recruiting → participant consents → interview (switch to
 *   typing) → session completed → de-identified transcript in the dashboard →
 *   analysis and memory → review panel (correction, MOS rating, metrics) →
 *   participant deletes everything with their code.
 *
 * Also checks RTL layout on the main screens (direction, no horizontal scroll)
 * at phone and desktop widths, and saves screenshots to e2e/artifacts/.
 *
 * Needs DATABASE_URL_TEST and a prior `next build`. Run: pnpm --filter @majlis/web test:e2e
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendTurn, createDb, createOrgWithOwner, interviewSessions } from "@majlis/db";
import { isolatedTestDb } from "@majlis/db/testing";
import { chromium, type Page } from "playwright";

if (!process.env.DATABASE_URL_TEST) throw new Error("DATABASE_URL_TEST is required");
const WEB_PORT = 3199;
const GW_PORT = 4199;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ARTIFACTS = fileURLToPath(new URL("./artifacts", import.meta.url));
mkdirSync(ARTIFACTS, { recursive: true });

const EMAIL = "e2e@majlis.test";
const PASSWORD = "e2e long password";

// ─── database ────────────────────────────────────────────────────────────────
const handle = await isolatedTestDb(process.env.DATABASE_URL_TEST, "e2e");
const DB_URL = handle.url;
await createOrgWithOwner(handle.db, {
  orgName: "مطاعم الديرة",
  email: EMAIL,
  name: "E2E",
  password: PASSWORD,
});
await handle.close();

// Recordings: encrypted, in one absolute folder shared by every service.
const STORAGE = {
  STORAGE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  STORAGE_DIR: mkdtempSync(join(tmpdir(), "majlis-recordings-")),
};

// ─── services ────────────────────────────────────────────────────────────────
const procs: ChildProcess[] = [];
function run(cmd: string, args: string[], cwd: string, env: Record<string, string>) {
  // Own process group, so stopping it also stops any children it starts.
  const p = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  p.stderr?.on("data", (d: Buffer) => process.env.E2E_VERBOSE && process.stderr.write(d));
  p.stdout?.on("data", (d: Buffer) => process.env.E2E_VERBOSE && process.stdout.write(d));
  procs.push(p);
  return p;
}
async function waitFor(url: string) {
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`service did not start: ${url}`);
}

run("node", ["dist/main.js"], join(ROOT, "apps/voice-gateway"), {
  DATABASE_URL: DB_URL,
  VOICE_GATEWAY_PORT: String(GW_PORT),
  GATEWAY_ALLOWED_ORIGINS: WEB,
  ...STORAGE,
});
run(
  "node",
  [
    join(ROOT, "apps/web/node_modules/next/dist/bin/next"),
    "start",
    "-p",
    String(WEB_PORT),
    "-H",
    "127.0.0.1",
  ],
  join(ROOT, "apps/web"),
  {
    DATABASE_URL: DB_URL,
    WEB_PUBLIC_URL: WEB,
    WEB_PUBLIC_VOICE_GATEWAY_URL: `ws://127.0.0.1:${GW_PORT}`,
    NODE_ENV: "production",
    ...STORAGE,
  },
);
await waitFor(`http://127.0.0.1:${GW_PORT}/healthz`);
await waitFor(`${WEB}/ar`);

// A silent microphone: the participant switches to typing.
const silentWav = join(mkdtempSync(join(tmpdir(), "majlis-")), "silence.wav");
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + 32000, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(16000, 24);
header.writeUInt32LE(32000, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(32000, 40);
writeFileSync(silentWav, Buffer.concat([header, Buffer.alloc(32000)]));

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${silentWav}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean) => {
  results.push([name, ok]);
  console.log(`${ok ? "✓" : "✗"} ${name}`);
};

async function layout(page: Page, name: string, expectedDir = "rtl") {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const { dir, overflow } = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }));
    check(
      `${name} @${width}px: ${expectedDir.toUpperCase()}, no horizontal scroll`,
      dir === expectedDir && !overflow,
    );
    await page.screenshot({ path: join(ARTIFACTS, `${name}-${width}.png`), fullPage: true });
  }
}

try {
  const errors: string[] = [];
  const client = await browser.newPage();
  client.on("pageerror", (e) => errors.push(String(e)));
  if (process.env.E2E_VERBOSE) {
    client.on("response", (r) =>
      console.log(
        "HTTP",
        r.status(),
        r.request().method(),
        r.url(),
        r.headers()["x-action-redirect"] ?? "",
      ),
    );
  }

  // Client signs in.
  await client.goto(`${WEB}/ar/login`);
  await layout(client, "login");
  await client.fill('input[name="email"]', EMAIL);
  await client.fill('input[name="password"]', PASSWORD);
  await client.getByRole("button", { name: "دخول", exact: true }).click();
  await client.waitForURL("**/ar/dashboard");
  await layout(client, "studies-empty");

  // One-sentence study.
  await client.goto(`${WEB}/ar/dashboard/studies/new`);
  await layout(client, "new-study");
  await client.fill('textarea[name="objective"]', "نقيس رضا زوار مطعم الديرة عن الأكل والأسعار");
  await client.fill('input[name="topic"]', "مطعم الديرة");
  await client.getByRole("button", { name: "أنشئ دليل المقابلة" }).click();
  await client.waitForURL(/\/ar\/dashboard\/studies\/[0-9a-f-]+$/);
  const firstQuestion = await client.inputValue("[data-question] input >> nth=0");
  check("guide generated from the objective", firstQuestion.includes("مطعم الديرة"));
  await layout(client, "guide-editor");

  // Edit and save a new guide version.
  await client.fill("[data-question] input >> nth=1", "وش اللي خلاك تختارين مطعم الديرة آخر مرة؟");
  await client.getByRole("button", { name: "حفظ نسخة جديدة" }).click();
  await client
    .getByText("حُفظت النسخة 2")
    .waitFor({ timeout: 8000 })
    .catch(async (e) => {
      console.log("STATUS:", await client.locator('[role="status"]').allTextContents());
      throw e;
    });
  check("guide edits saved as version 2", true);

  // Open recruiting and get the invite link.
  await client.click('a[href="?tab=invite"]');
  await client.getByRole("button", { name: "فتح الاستقبال" }).click();
  await client.getByRole("button", { name: "إيقاف الاستقبال" }).waitFor();
  const invite = await client.inputValue('[data-testid="invite-link"]');
  check("QR code rendered", (await client.locator("svg").count()) > 0);
  await layout(client, "invite");

  // Participant.
  const participant = await browser.newPage();
  participant.on("pageerror", (e) => errors.push(String(e)));
  if (process.env.E2E_VERBOSE)
    participant.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
  await participant.goto(invite);
  await layout(participant, "participant-welcome");
  await participant.getByRole("button", { name: "التالي" }).click();
  await participant.getByLabel(/الجنس/).selectOption("female");
  await participant.getByLabel(/المدينة/).selectOption("jeddah");
  await participant.getByLabel(/العمر/).selectOption("25-34");
  await participant.getByText("مرتين إلى ثلاث").click();
  await layout(participant, "participant-about");
  await participant.getByRole("button", { name: "التالي" }).click();
  await participant.getByText("نسائي").click();
  const disclosure = await participant.textContent('[data-testid="disclosure"]');
  check(
    "disclosure shown before consent says it is an AI assistant",
    Boolean(disclosure?.includes("مساعدة ذكية")),
  );
  check(
    "start is disabled until consent is given",
    await participant.getByRole("button", { name: "ابدأ" }).isDisabled(),
  );
  await participant.getByText("أوافق على المشاركة").click();
  await layout(participant, "participant-consent");
  await participant.getByRole("button", { name: "ابدأ" }).click();

  await participant.locator('[data-testid="caption"]').waitFor();
  check(
    "interviewer opens with the disclosure",
    (await participant.textContent('[data-testid="caption"]'))!.includes("مساعدة ذكية"),
  );
  await layout(participant, "participant-interview");
  await participant.getByRole("button", { name: "أكمل كتابة" }).click();

  const answers = [
    "إيه نبدأ",
    "اخترته لأنه قريب من البيت وأكله دايم طازج",
    "الطلب كان سريع بس الاستلام أخذ ربع ساعة",
    "الأكل طعمه ممتاز والكمية مناسبة للعائلة",
    "الموظفين محترمين ويردون بسرعة، رقمي 0551234567 لو تبون تتواصلون",
    "الأسعار مقبولة مقارنة بالكمية والجودة",
    "أوسّع الجلسات العائلية وأخلي الإضاءة أهدى",
    "بقول لهم جربوه أكيد بس روحوا بدري",
  ];
  const box = participant.getByRole("textbox");
  for (const answer of answers) {
    if (await participant.getByText("يعطيك العافية!").isVisible()) break;
    const before = await participant.textContent('[data-testid="caption"]');
    await box.fill(answer);
    await participant.getByRole("button", { name: "إرسال" }).click();
    await participant.waitForFunction(
      (prev) => document.querySelector('[data-testid="caption"]')?.textContent !== prev,
      before,
      { timeout: 5000 },
    );
  }
  await participant.getByText("يعطيك العافية!").waitFor({ timeout: 10000 });
  check("participant reaches the thank-you screen", true);
  const deletionCode = (await participant.textContent('[data-testid="deletion-code"]')) ?? "";
  check(
    "thank-you screen shows a deletion code",
    /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(deletionCode),
  );
  await layout(participant, "participant-thanks");

  // Results in the dashboard.
  await client.goto(client.url().replace(/\?tab=\w+$/, "?tab=sessions"));
  await client
    .locator('[data-session-status="completed"]')
    .waitFor({ timeout: 5000 })
    .catch(async (e) => {
      await client.screenshot({ path: join(ARTIFACTS, "debug-sessions.png"), fullPage: true });
      console.log("URL:", client.url());
      throw e;
    });
  check(
    "completed session listed with segment attributes",
    (await client.textContent('[data-session-status="completed"]'))!.includes("جدة"),
  );
  await layout(client, "sessions");
  await client.getByText("عرض النص").first().click();
  await client.locator('[data-role="participant"]').first().waitFor();
  const transcript = (await client.textContent("ol")) ?? "";
  check("transcript stored and shown", transcript.includes("قريب من البيت"));
  check(
    "phone number redacted for the client",
    transcript.includes("[محذوف]") && !transcript.includes("0551234567"),
  );
  await layout(client, "transcript");

  // Analysis: the worker turns completed interviews into results and memory.
  await new Promise<void>((resolve, reject) => {
    const w = spawn("node", ["dist/main.js", "--once"], {
      cwd: join(ROOT, "apps/worker"),
      env: { ...process.env, DATABASE_URL: DB_URL, PERSONA_MIN_SESSIONS: "1", ...STORAGE },
      stdio: "ignore",
    });
    w.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  });
  await client.goto(client.url().replace(/\/sessions\/[^/?]+.*$/, "?tab=results"));
  await client
    .locator("[data-theme]")
    .first()
    .waitFor({ timeout: 5000 })
    .catch(async (e) => {
      await client.screenshot({ path: join(ARTIFACTS, "debug-results.png"), fullPage: true });
      console.log("URL:", client.url());
      throw e;
    });
  const results = (await client.textContent("main")) ?? "";
  check(
    "results show themes from the guide",
    results.includes("السعر") && results.includes("التحسين"),
  );
  check(
    "results quote participants without personal data",
    results.includes("الأسعار مقبولة") && !results.includes("0551234567"),
  );
  check(
    "segment comparison table rendered",
    (await client.locator('[data-testid="compare"] tbody tr').count()) > 0,
  );
  await layout(client, "results");

  await client.goto(`${WEB}/ar/dashboard/memory`);
  await client.getByRole("textbox").fill("وش رأي الأمهات في جدة بالأسعار؟");
  await client.getByRole("button", { name: "اسأل", exact: true }).click();
  const answerBox = client.locator('[data-testid="memory-answer"]');
  await answerBox.waitFor({ timeout: 8000 });
  const answerText = (await answerBox.textContent()) ?? "";
  check(
    "memory answers from the interview, citing the quote",
    answerText.includes("الأسعار مقبولة"),
  );
  check(
    "memory states that parenthood is not recorded",
    answerText.includes("ما نسجّل إذا كان المشارك أباً أو أماً"),
  );
  check(
    "memory applied the Jeddah + female filter",
    answerText.includes("جدة") && answerText.includes("أنثى"),
  );
  check(
    "persona built from the interview",
    (await client.textContent("main"))!.includes("النسخة 1"),
  );
  await layout(client, "memory");

  // Review panel: a low-confidence voice answer waits for a human correction.
  const direct = createDb(DB_URL);
  const [session] = await direct.db.select().from(interviewSessions);
  await appendTurn(direct.db, session!.id, {
    role: "participant",
    text: "الاكل باهض شوي",
    asrConfidence: 0.42,
  });
  await direct.close();

  await client.goto(`${WEB}/ar/dashboard/review`);
  check(
    "review panel lists the low-confidence segment",
    await client.getByTestId("flag").isVisible(),
  );
  await client.getByTestId("flag").locator("textarea").fill("الأكل باهظ شوي");
  await client.getByRole("button", { name: "احفظ التصحيح" }).click();
  await client.getByTestId("flag").getByText("تم الحفظ").waitFor();
  const rate = client.getByTestId("rate").first();
  const ttsSrc = (await rate.locator("audio").getAttribute("src")) ?? "";
  // Fetched from the page, as the <audio> element does (the session cookie is Secure).
  const tts = await client.evaluate(async (src) => {
    const r = await fetch(src);
    return {
      ok: r.ok,
      type: r.headers.get("content-type"),
      bytes: (await r.arrayBuffer()).byteLength,
    };
  }, ttsSrc);
  check(
    "interviewer line is playable for MOS rating",
    tts.ok && tts.type === "audio/wav" && tts.bytes > 44,
  );
  await rate.getByText("4", { exact: true }).click();
  await rate.getByRole("button", { name: "احفظ التقييم" }).click();
  await rate.getByText("تم الحفظ").waitFor();
  await client.reload();
  const metrics = (await client.getByTestId("metric").allTextContents()).join(" | ");
  check(
    "metrics show measured WER and MOS with their sample sizes",
    metrics.includes("WER") && metrics.includes("4.00") && metrics.includes("العينة: 1"),
  );
  check("metrics compare against the section-3 targets", metrics.includes("≥ 4.4"));
  await layout(client, "review");
  const anonymous = await browser.newContext();
  const leaked = await anonymous.request.get(`${WEB}${ttsSrc}`);
  check("review audio requires a reviewer session", leaked.status() === 404);
  await anonymous.close();

  // The participant deletes their participation with the code.
  await participant.goto(`${WEB}/ar/delete`);
  await layout(participant, "deletion");
  await participant.getByLabel("رمز الحذف").fill("AAAA-BBBB-CCCC");
  await participant.getByRole("button", { name: "احذف مشاركتي" }).click();
  await participant.getByText("ما لقينا مشاركة").waitFor();
  check("wrong deletion code is rejected", true);
  await participant.getByLabel("رمز الحذف").fill(deletionCode.toLowerCase());
  await participant.getByRole("button", { name: "احذف مشاركتي" }).click();
  await participant.getByText("تم حذف مشاركتك").waitFor();
  check("participant erased with their code", true);
  await client.goto(`${WEB}/ar/dashboard/memory`);
  await client.getByRole("textbox").fill("وش رأيهم بالأسعار؟");
  await client.getByRole("button", { name: "اسأل", exact: true }).click();
  await client.locator('[data-testid="memory-answer"]').waitFor({ timeout: 8000 });
  check(
    "erased answers no longer appear in memory",
    !((await client.textContent("main")) ?? "").includes("الأسعار مقبولة"),
  );

  // English stays LTR.
  await client.goto(`${WEB}/en/login`);
  await layout(client, "login-en", "ltr");

  check("no page errors", errors.length === 0);
  if (errors.length) console.log(errors);
} finally {
  await browser.close();
  for (const p of procs) if (p.pid) process.kill(-p.pid, "SIGTERM");
}

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
