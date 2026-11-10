import { expect, test, devices } from "@playwright/test";

const uid = Date.now().toString(36);
const slug = `e2e-${uid}`;
const email = `owner-${uid}@example.com`;
const password = "e2e-very-strong-pass";

test("full journey: signup → program → customer joins → cashier stamps → reward → redeem", async ({ page, browser }) => {
  // 1. Merchant signs up (Arabic by default)
  await page.goto("/signup");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByLabel("اسم المقهى / المتجر").fill("مقهى الاختبار");
  await page.getByLabel("رابط المتجر (بالإنجليزية)").fill(slug);
  await page.getByLabel("اسم الفرع الأول").fill("الفرع الرئيسي");
  await page.getByLabel("اسمك").fill("مالك الاختبار");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page).toHaveURL(/\/dashboard\/program/);

  // 2. Configure a 3-stamp program without cooldown
  await page.getByLabel("عدد الأختام للمكافأة").fill("3");
  await page.getByLabel("المكافأة", { exact: true }).fill("كرواسون مجاني");
  await page.getByLabel("أقل مدة بين ختمين (بالدقائق)").fill("0");
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("تم الحفظ")).toBeVisible();
  const joinUrl = (await page.getByTestId("join-link").textContent())!.trim();

  // 3. Customer joins on a phone
  const phoneCtx = await browser.newContext({ ...devices["iPhone 13"], locale: "ar-SA" });
  const customer = await phoneCtx.newPage();
  await customer.goto(new URL(joinUrl).pathname);
  await expect(customer.getByRole("heading", { name: /مقهى الاختبار/ })).toBeVisible();
  await customer.getByLabel("الاسم").fill("سارة");
  await customer.getByLabel("رقم الجوال").fill("0551239876");
  await customer.getByLabel(/أوافق على سياسة الخصوصية/).check();
  await customer.getByRole("button", { name: "احصل على بطاقتي" }).click();
  await expect(customer).toHaveURL(/\/c\/[A-Z0-9]+\?k=/);
  await expect(customer.getByTestId("stamp-progress")).toContainText("0");
  await expect(customer.getByTestId("card-qr").locator("svg")).toBeVisible();

  // 4. Owner opens the cashier screen and binds the branch
  await page.goto("/pos");
  await expect(page).toHaveURL(/\/pos\/branch/);
  await page.getByRole("button", { name: /الفرع الرئيسي/ }).click();
  await expect(page).toHaveURL(/\/pos$/);

  // 5. Lookup by phone and stamp three times
  await page.getByTestId("lookup-input").fill("0551239876");
  await page.getByRole("button", { name: "بحث" }).click();
  await expect(page.getByTestId("pos-card")).toContainText("سارة");
  for (let i = 1; i <= 3; i++) {
    await page.getByTestId("pos-stamp").click();
    await expect(page.getByTestId("pos-success")).toBeVisible();
  }
  await expect(page.getByTestId("pos-success")).toContainText("المكافأة أصبحت جاهزة");
  await expect(page.getByTestId("pos-rewards")).toContainText("1");

  // 6. Customer's card reflects the reward
  await customer.reload();
  await expect(customer.getByTestId("rewards-available")).toHaveText("1");

  // 7. Redeem
  await page.getByTestId("pos-redeem").click();
  await expect(page.getByTestId("pos-success")).toContainText("كرواسون مجاني");
  await expect(page.getByTestId("pos-redeem")).toHaveCount(0);
  await customer.reload();
  await expect(customer.getByTestId("rewards-available")).toHaveText("0");

  // 8. Dashboard shows the customer and the visits
  await page.goto("/dashboard");
  await expect(page.getByTestId("kpi-customers")).toHaveText("1");
  await expect(page.getByTestId("kpi-visits")).toHaveText("3");
  await page.goto("/dashboard/customers");
  await expect(page.getByTestId("customers-table")).toContainText("سارة");

  // 9. Cashier PIN login on a separate device
  await page.goto("/dashboard/staff");
  await page.getByLabel("الاسم").fill("كاشير الصباح");
  await page.getByLabel("رمز دخول الكاشير (4-6 أرقام)").fill("246810");
  await page.getByRole("button", { name: "إضافة موظف" }).click();
  await expect(page.locator("table")).toContainText("كاشير الصباح");
  const tablet = await browser.newContext({ locale: "ar-SA" });
  const pos = await tablet.newPage();
  await pos.goto(`/pos/login?m=${slug}`);
  await pos.getByLabel("رمز الدخول").fill("246810");
  await pos.getByRole("button", { name: "دخول" }).click();
  await expect(pos).toHaveURL(/\/pos$/);
  await pos.getByTestId("lookup-input").fill("0551239876");
  await pos.getByRole("button", { name: "بحث" }).click();
  await expect(pos.getByTestId("pos-progress")).toContainText("0");

  await phoneCtx.close();
  await tablet.close();
});

test("home page, English mode and security headers", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  expect(res?.headers()["x-frame-options"]).toBe("DENY");
  expect(res?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("يرجع لك");
  await page.getByRole("link", { name: "دخول التاجر" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Merchant sign in");
  await page.getByRole("button", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("protected pages redirect and forged card links 404", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  const r = await page.goto("/c/ABCDEFGHJKLMNPQR?k=nope");
  expect(r?.status()).toBe(404);
  const api = await page.request.post("/api/pos/stamp", { data: { serial: "ABCDEFGHJKLMNPQR", quantity: 1 } });
  expect(api.status()).toBe(401);
});
