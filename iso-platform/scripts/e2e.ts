/**
 * Browser E2E of the ISO 9001 customer journey against a running server (BASE_URL).
 * Usage: BASE_URL=http://localhost:3100 npx tsx scripts/e2e.ts
 * Writes screenshots to test-results/.
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { GOLDEN } from "../tests/golden";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "test-results";
const EXE = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const PW = "Passw0rd-strong";
const stamp = Date.now();
const results: { step: string; ok: boolean; info?: string }[] = [];

function check(step: string, ok: boolean, info?: string) {
  results.push({ step, ok, info });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${info ? ` — ${info}` : ""}`);
  if (!ok) throw new Error(`E2E failed at: ${step}`);
}

async function flashText(page: Page) {
  return (await page.locator('[role="alert"], [role="status"]').first().textContent().catch(() => null)) ?? "";
}

/** Server actions redirect client-side (URL always changes: new path or ?ok=/?err= flash). */
async function submitAndWait(page: Page, button: ReturnType<Page["locator"]>) {
  const before = page.url();
  const posted = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 20000 });
  await button.click();
  await posted;
  // Either the URL changes (redirect/flash) or the same URL is re-rendered.
  await page.waitForURL((u) => u.href !== before, { timeout: 1500 }).catch(() => {});
  await page.waitForLoadState("networkidle");
}

async function answerInterview(page: Page, answers: Record<string, unknown>) {
  for (let i = 0; i < 60; i++) {
    const qid = await page.locator('input[name="questionId"]').getAttribute("value").catch(() => null);
    if (!qid) return i;
    const type = await page.locator('input[name="type"]').getAttribute("value");
    const v = answers[qid];
    if (v === undefined) throw new Error(`no golden answer for ${qid}`);
    if (type === "text") await page.locator('textarea[name="value"]').fill(String(v));
    else if (type === "number") await page.locator('input[name="value"]').fill(String(v));
    else if (type === "boolean" || type === "single") await page.locator(`input[name="value"][value="${String(v)}"]`).check();
    else if (type === "multi") {
      for (const box of await page.locator('input[name="value"]').all()) await box.setChecked((v as string[]).includes((await box.getAttribute("value"))!));
    }
    await submitAndWait(page, page.getByRole("button", { name: "حفظ ومتابعة" }));
    const err = await page.locator('[role="alert"]').count();
    if (err && (await page.locator('input[name="questionId"]').getAttribute("value").catch(() => null)) === qid) {
      throw new Error(`answer rejected for ${qid}: ${await flashText(page)}`);
    }
  }
  throw new Error("interview did not finish");
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "ar-SA" });
  const page = await desktop.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  try {
    // 1. Marketing → register
    await page.goto(BASE);
    check("landing renders RTL Arabic", (await page.locator("html").getAttribute("dir")) === "rtl" && (await page.locator("h1").first().textContent())!.includes("نظام إدارة جودة"));
    await page.screenshot({ path: `${OUT}/01-landing.png`, fullPage: true });

    const ownerEmail = `owner-${stamp}@e2e.local`;
    await page.goto(`${BASE}/register`);
    await page.fill('input[name="fullName"]', "سارة المالكة");
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PW);
    await page.check('input[name="terms"]');
    await submitAndWait(page, page.getByRole("button", { name: "إنشاء الحساب" }));
    check("register → onboarding", page.url().endsWith("/onboarding"));

    // 2. Create organization
    await page.fill('input[name="name"]', `مطاعم النخبة ${stamp}`);
    await page.selectOption('select[name="industryCode"]', "FOOD_SERVICE");
    await page.fill('input[name="city"]', "الرياض");
    await submitAndWait(page, page.getByRole("button", { name: "إنشاء المنشأة" }));
    check("organization created → dashboard", page.url().endsWith("/app"));
    await page.screenshot({ path: `${OUT}/02-dashboard-empty.png`, fullPage: true });

    // 3. Add a site
    await page.goto(`${BASE}/app/org`);
    await page.fill('form:has(h3) input[name="name"]', "فرع العليا");
    await page.fill('form:has(h3) input[name="city"]', "الرياض");
    await submitAndWait(page, page.getByRole("button", { name: "إضافة", exact: true }));
    check("site added", (await flashText(page)).includes("تمت إضافة الموقع"));

    // 4. Add a quality manager (one-time password returned in action state)
    await page.goto(`${BASE}/app/members`);
    const qmEmail = `qm-${stamp}@e2e.local`;
    await page.fill('input[name="fullName"]', "خالد مدير الجودة");
    await page.fill('input[name="email"]', qmEmail);
    await page.locator('form:has(button:text("إضافة عضو")) select[name="role"]').selectOption("QUALITY_MANAGER");
    await page.getByRole("button", { name: "إضافة عضو" }).click();
    await page.locator("code").waitFor({ timeout: 15000 });
    const tempPw = (await page.locator("code").textContent())!.trim();
    check("member added with one-time password", tempPw.length >= 12 && !page.url().includes(tempPw));

    // 5. Project + adaptive interview
    await page.goto(`${BASE}/app/projects`);
    await submitAndWait(page, page.getByRole("button", { name: "ابدأ المقابلة التشخيصية" }));
    check("project created → intake", /\/app\/projects\/[0-9a-f-]+\/intake$/.test(page.url()));
    const projectUrl = page.url().replace(/\/intake$/, "");
    await page.screenshot({ path: `${OUT}/03-intake.png`, fullPage: true });

    // Contradiction first: 6 sites but 3 people
    const g = { ...GOLDEN.restaurantChain.answers };
    await answerInterview(page, { ...g, "core.headcount": 3 }).catch((e) => console.log("interview(phase1):", e.message));
    const conflictsShown = await page.getByText("تعارضات تحتاج معالجة").count();
    check("contradiction detected and shown", conflictsShown > 0);
    await page.goto(`${projectUrl}/intake?edit=core.headcount`);
    await page.fill('input[name="value"]', "140");
    await submitAndWait(page, page.getByRole("button", { name: "حفظ ومتابعة" }));
    await answerInterview(page, g);
    check("interview completed", (await page.getByText("اكتملت المقابلة").count()) > 0);
    await page.screenshot({ path: `${OUT}/04-intake-complete.png`, fullPage: true });

    // 6. Blueprint
    await page.goto(`${projectUrl}/blueprint`);
    await submitAndWait(page, page.getByRole("button", { name: "توليد هيكل النظام" }));
    check("blueprint generated", (await flashText(page)).includes("تم توليد هيكل النظام"));
    const body = await page.textContent("body");
    check("restaurant processes present (central kitchen, delivery)", body!.includes("المطبخ المركزي") && body!.includes("التوصيل"));
    check("licensing gate disclosed", body!.includes("لا يوجد ترخيص نشط"));
    await page.screenshot({ path: `${OUT}/05-blueprint.png`, fullPage: true });

    // 7. Scope approval gate + approve
    await submitAndWait(page, page.getByRole("button", { name: "اعتماد النطاق والهيكل" }));
    check("scope approval requires confirmation", (await flashText(page)).includes("يجب تأكيد"));
    await page.check('input[name="confirm"]');
    await submitAndWait(page, page.getByRole("button", { name: "اعتماد النطاق والهيكل" }));
    check("scope approved", (await flashText(page)).includes("تم اعتماد النطاق"));

    // 8. Generate documents (durable job, drained after response)
    await submitAndWait(page, page.getByRole("button", { name: "توليد الوثائق المخصصة" }));
    let docsCount = 0;
    for (let i = 0; i < 20 && docsCount < 20; i++) {
      await page.waitForTimeout(1000);
      await page.goto(`${BASE}/app/documents`);
      docsCount = await page.locator("tbody tr").count();
    }
    check("documents generated via job queue", docsCount >= 20, `${docsCount} documents`);
    await page.screenshot({ path: `${OUT}/06-documents.png`, fullPage: true });

    // 9. Edit policy draft, resolve placeholders, submit
    await page.getByRole("link", { name: "سياسة الجودة" }).click();
    await page.waitForLoadState("networkidle");
    const docUrl = page.url();
    check("placeholders flagged before approval", (await page.getByText("بيانات ناقصة يجب أن تقدمها المنشأة").count()) > 0);
    const text = await page.locator('textarea[name="body"]').inputValue();
    await page.fill('textarea[name="body"]', text.replace(/\[MISSING:[^\]]*\]/g, "نلتزم بتجربة ضيافة متميزة ومتسقة في جميع الفروع."));
    await page.fill('input[name="summary"]', "استكمال توجهات الإدارة");
    await submitAndWait(page, page.getByRole("button", { name: "حفظ المسودة" }));
    check("draft saved", (await flashText(page)).includes("تم حفظ المسودة"));
    await submitAndWait(page, page.getByRole("button", { name: "إرسال للمراجعة" }));
    check("submitted for review", (await flashText(page)).includes("أُرسلت للمراجعة"));
    check("author cannot approve own version (button disabled)", await page.getByRole("button", { name: "اعتماد", exact: true }).isDisabled());

    // 10. Quality manager: forced password change, approve, make effective
    const qmCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-SA", isMobile: true });
    const qm = await qmCtx.newPage();
    await qm.goto(`${BASE}/login`);
    await qm.fill('input[name="email"]', qmEmail);
    await qm.fill('input[name="password"]', tempPw);
    await submitAndWait(qm, qm.getByRole("button", { name: "دخول" }));
    check("temporary password forces change", qm.url().endsWith("/change-password"));
    await qm.fill('input[name="current"]', tempPw);
    await qm.fill('input[name="next"]', "QmPassw0rd-new");
    await submitAndWait(qm, qm.getByRole("button", { name: "حفظ" }));
    check("QM logged in", qm.url().endsWith("/app"));
    await qm.goto(docUrl);
    await submitAndWait(qm, qm.getByRole("button", { name: "اعتماد", exact: true }));
    check("QM approved", (await flashText(qm)).includes("تم الاعتماد"));
    await submitAndWait(qm, qm.getByRole("button", { name: "جعل الإصدار سارياً" }));
    check("version effective", (await flashText(qm)).includes("أصبح الإصدار سارياً"));
    await qm.screenshot({ path: `${OUT}/07-document-mobile.png`, fullPage: true });
    const overflow = await qm.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check("no horizontal page overflow on mobile", overflow <= 1, `overflow=${overflow}px`);

    // 11. DOCX download
    const versionId = await page.locator('input[name="versionId"]').first().getAttribute("value").catch(() => null);
    await page.reload();
    const href = await page.getByRole("link", { name: "تنزيل Word" }).getAttribute("href");
    const res = await page.request.get(`${BASE}${href}`);
    const buf = await res.body();
    check("DOCX downloads", res.status() === 200 && buf.subarray(0, 2).toString() === "PK" && res.headers()["content-type"].includes("wordprocessingml"), `${buf.length} bytes`);
    void versionId;

    // 12. New revision keeps effective version
    await page.fill('input[name="summary"]', "مراجعة سنوية");
    await submitAndWait(page, page.getByRole("button", { name: "إصدار جديد" }));
    check("new revision created as draft", (await flashText(page)).includes("أُنشئ إصدار جديد"));

    // 13. Cross-tenant probe: a different organization cannot open this document
    const other = await browser.newContext();
    const op = await other.newPage();
    await op.goto(`${BASE}/register`);
    await op.fill('input[name="fullName"]', "مستخدم آخر");
    await op.fill('input[name="email"]', `other-${stamp}@e2e.local`);
    await op.fill('input[name="password"]', PW);
    await op.check('input[name="terms"]');
    await submitAndWait(op, op.getByRole("button", { name: "إنشاء الحساب" }));
    await op.fill('input[name="name"]', "شركة أخرى");
    await op.selectOption('select[name="industryCode"]', "SOFTWARE");
    await submitAndWait(op, op.getByRole("button", { name: "إنشاء المنشأة" }));
    const probe = await op.goto(docUrl);
    const probeBody = await op.textContent("body");
    check("cross-tenant document URL returns 404", probe!.status() === 404 && !probeBody!.includes("سياسة الجودة"));
    const dl = await op.request.get(`${BASE}${href}`);
    check("cross-tenant DOCX download blocked", dl.status() === 404);
    const anon = await (await browser.newContext()).request.get(`${BASE}${href}`);
    check("anonymous DOCX download blocked", anon.status() === 401);

    // 14. Dashboard separates metrics
    await page.goto(`${BASE}/app`);
    const dash = await page.textContent("body");
    check("dashboard keeps implementation separate from documentation", dash!.includes("التطبيق وكفاية الأدلة") && dash!.includes("لم يبدأ"));
    await page.screenshot({ path: `${OUT}/08-dashboard.png`, fullPage: true });

    check("no client-side JS errors", errors.length === 0, errors.join(" | "));
  } finally {
    await browser.close();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    if (failed || results.length === 0) process.exitCode = 1;
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
