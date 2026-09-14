#!/usr/bin/env node
/**
 * مشغّل اختبارات القبول الـ25 على البيئة الحيّة.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=… APP_BASE_URL=… \
 *   node scripts/acceptance.mjs
 *
 * ينشئ مستخدمين تجريبيين بادئتهم ACC، ينفّذ السيناريوهات كاملة،
 * ثم ينظّف كل ما أنشأه. لا يمسّ بيانات الإنتاج القائمة.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const {
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY, APP_BASE_URL,
} = process.env;

for (const [k, v] of Object.entries({
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY,
})) {
  if (!v) { console.error(`✖ متغير البيئة ${k} مفقود.`); process.exit(1); }
}

const API = `${SUPABASE_URL}/functions/v1/procurement-portal`;
const DOMAIN = "phone.alnadeg.local";
const TEST_PASSWORD = "AccTest#2026$Nadeg";
const TAG = "ACC-TEST";

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = () => createClient(SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ------------------------------------------------------------------ تقرير
const results = [];
let currentGroup = "";

function group(n, title) { currentGroup = `${n}. ${title}`; }

function record(ok, detail, manual = false) {
  results.push({ test: currentGroup, ok, detail, manual });
  const mark = manual ? "▲" : ok ? "✅" : "❌";
  console.log(`${mark} ${currentGroup}\n   ${detail}`);
}

async function check(n, title, fn) {
  group(n, title);
  try {
    const detail = await fn();
    record(true, detail ?? "نجح");
  } catch (e) {
    record(false, e instanceof Error ? e.message : String(e));
  }
}

function manual(n, title, instruction) {
  group(n, title);
  record(true, instruction, true);
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ------------------------------------------------------------------ أدوات
async function signIn(phone) {
  const c = anonClient();
  const { data, error } = await c.auth.signInWithPassword({
    email: `${phone}@${DOMAIN}`, password: TEST_PASSWORD,
  });
  if (error) throw new Error(`تعذر دخول ${phone}: ${error.message}`);
  return { client: c, userId: data.user.id, token: data.session.access_token };
}

async function apiCall(token, path, method = "POST", body) {
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, body: json };
}

const testUsers = {};   // role → { phone, id }
let cleanupRequestIds = [];

async function makeUser(role, phone, locationCode, name) {
  const { data: loc } = await svc.from("locations")
    .select("id").eq("code", locationCode).single();
  assert(loc, `الموقع ${locationCode} غير موجود`);

  // إزالة أي بقايا من تشغيل سابق
  const { data: old } = await svc.from("profiles")
    .select("id").eq("phone", phone).maybeSingle();
  if (old) await svc.auth.admin.deleteUser(old.id).catch(() => {});

  const { data: created, error } = await svc.auth.admin.createUser({
    email: `${phone}@${DOMAIN}`, password: TEST_PASSWORD, email_confirm: true,
    app_metadata: { role },
  });
  if (error) throw new Error(`تعذر إنشاء ${role}: ${error.message}`);

  await svc.from("profiles").upsert({
    id: created.user.id, full_name: `${TAG} ${name}`, phone, role,
    location_id: loc.id, is_active: true, must_change_password: false,
  });

  testUsers[role] = { phone, id: created.user.id, locationId: loc.id };
  return created.user.id;
}

async function cleanup() {
  for (const id of cleanupRequestIds) {
    await svc.from("request_documents").delete().eq("request_id", id);
    await svc.from("approvals").delete().eq("request_id", id);
    await svc.from("purchase_requests").delete().eq("id", id);
  }
  const { data: leftovers } = await svc.from("purchase_requests")
    .select("id").like("justification", `${TAG}%`);
  for (const r of leftovers ?? []) {
    await svc.from("request_documents").delete().eq("request_id", r.id);
    await svc.from("approvals").delete().eq("request_id", r.id);
    await svc.from("purchase_requests").delete().eq("id", r.id);
  }
  for (const u of Object.values(testUsers)) {
    await svc.from("profiles").delete().eq("id", u.id).catch(() => {});
    await svc.auth.admin.deleteUser(u.id).catch(() => {});
  }
}

// ------------------------------------------------------------------ التشغيل
console.log(`\n${"═".repeat(66)}`);
console.log("   اختبارات القبول — بوابة مشتريات فروع شركة مطاعم الناضج");
console.log(`${"═".repeat(66)}\n`);

try {
  // ---------- 1 و 2: المواقع ----------
  await check(1, "ظهور المواقع الـ27 كاملة", async () => {
    const { data, error } = await svc.from("locations")
      .select("code, name_ar, kind, sort_order").eq("is_active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    const expected = [
      "الشفا", "العليا", "الصحافة", "اشبيلية", "الربوة", "العارض", "غرناطة",
      "النرجس", "العزيزية", "طريق الدمام - الجنادرية", "بدر", "مخرج 24",
      "مخرج 28", "مخرج 18", "اليرموك", "الخرج", "بريدة", "الأحساء",
      "حفر الباطن", "الطائف", "المدينة المنورة", "المعمل المركزي",
      "المستودع المركزي", "قسم الحوش", "قسم الحفلات", "قسم الخضار",
      "الإدارة المركزية",
    ];
    const names = data.map((l) => l.name_ar);
    const missing = expected.filter((e) => !names.includes(e));
    assert(missing.length === 0, `مواقع ناقصة: ${missing.join("، ")}`);
    const branches = data.filter((l) => l.kind === "branch").length;
    const central = data.filter((l) => l.kind === "central").length;
    assert(branches === 21, `عدد الفروع ${branches} بدلاً من 21`);
    assert(central === 6, `المواقع المركزية ${central} بدلاً من 6`);
    return `27 موقعًا نشطًا — ${branches} فرعًا و${central} مواقع مركزية، بالترتيب المعتمد`;
  });

  await check(2, "عدم وجود موقع مكرر", async () => {
    const { data } = await svc.from("locations").select("name_ar, code");
    const names = data.map((l) => l.name_ar?.trim());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    assert(dupes.length === 0, `مواقع مكررة: ${[...new Set(dupes)].join("، ")}`);
    const codes = data.map((l) => l.code);
    const dupCodes = codes.filter((c, i) => c && codes.indexOf(c) !== i);
    assert(dupCodes.length === 0, `أكواد مكررة: ${dupCodes.join("، ")}`);
    return `لا يوجد تكرار في الأسماء أو الأكواد (${data.length} موقعًا)`;
  });

  // ---------- 3: التفعيل ----------
  await check(3, "نجاح تفعيل حساب المدير لمرة واحدة فقط", async () => {
    const phone = "0500000099";
    const { data: stale } = await svc.from("profiles")
      .select("id").eq("phone", `966${phone.slice(1)}`).maybeSingle();
    if (stale) { await svc.auth.admin.deleteUser(stale.id).catch(() => {}); }

    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const { error } = await svc.rpc("create_activation_token", {
      p_token_hash: hash, p_full_name: `${TAG} مدير تجريبي`,
      p_phone: phone, p_role: "super_admin", p_location_code: "CN-06", p_hours: 1,
    });
    if (error) throw new Error(`تعذر إنشاء الرمز: ${error.message}`);

    const verify = await apiCall(null, `activation/verify?token=${token}`, "GET");
    assert(verify.ok && verify.body.valid, "فحص الرمز فشل");

    const body = {
      token, full_name: "مدير تجريبي للاختبار", phone,
      password: TEST_PASSWORD, password_confirm: TEST_PASSWORD,
    };
    const first = await apiCall(null, "activate", "POST", body);
    assert(first.ok, `التفعيل الأول فشل: ${JSON.stringify(first.body)}`);

    const second = await apiCall(null, "activate", "POST", body);
    assert(!second.ok, "الرمز قُبل مرتين — خلل أمني خطير");

    const { data: p } = await svc.from("profiles")
      .select("id, role, is_active").eq("phone", `966${phone.slice(1)}`).single();
    assert(p?.role === "super_admin", "الدور لم يُضبط على super_admin");

    await svc.from("profiles").delete().eq("id", p.id);
    await svc.auth.admin.deleteUser(p.id);
    return "التفعيل نجح مرة واحدة، ورُفضت المحاولة الثانية، والدور super_admin";
  });

  // ---------- 6 و 7: إنشاء مستخدم لكل دور وربطه بفرع ----------
  await check(6, "إنشاء مستخدم لكل دور", async () => {
    await makeUser("super_admin", "0500000001", "CN-06", "مدير النظام");
    await makeUser("requester", "0500000002", "BR-01", "مقدم طلب");
    await makeUser("production_officer", "0500000003", "BR-01", "مسؤول إنتاج");
    await makeUser("branch_manager", "0500000004", "BR-01", "مدير فرع");
    await makeUser("production_manager", "0500000005", "CN-06", "مدير إنتاج");
    await makeUser("procurement", "0500000006", "CN-06", "مشتريات");
    await makeUser("finance", "0500000007", "CN-06", "مالية");
    await makeUser("requester", "0500000008", "BR-02", "مقدم طلب فرع آخر");
    return `تم إنشاء ${Object.keys(testUsers).length} أدوار مختلفة بنجاح`;
  });

  await check(7, "ربط مستخدم بفرع محدد", async () => {
    const { data } = await svc.from("profiles")
      .select("phone, role, locations(name_ar, code)")
      .eq("phone", "966500000003").single();
    assert(data.locations?.code === "BR-01",
      `الموقع ${data.locations?.code} بدلاً من BR-01`);
    return `مسؤول الإنتاج مرتبط بفرع ${data.locations.name_ar}`;
  });

  // ---------- 4: دخول بالجوال وكلمة المرور ----------
  await check(4, "دخول المدير بالجوال وكلمة المرور", async () => {
    const { client, userId } = await signIn("966500000001");
    const { data } = await client.from("profiles")
      .select("role, full_name").eq("id", userId).single();
    assert(data.role === "super_admin", "الدور غير صحيح بعد الدخول");
    await client.auth.signOut();
    return "الدخول برقم الجوال وكلمة المرور نجح دون أي رسالة SMS";
  });

  // ---------- 5: بوابة الأدمن للمدير فقط ----------
  await check(5, "ظهور بوابة الأدمن للمدير فقط", async () => {
    const admin = await signIn("966500000001");
    const { data: adminLogs, error: adminErr } = await admin.client
      .from("audit_logs").select("id").limit(1);
    assert(!adminErr, `المدير لا يستطيع قراءة سجل التدقيق: ${adminErr?.message}`);

    const req = await signIn("966500000002");
    const { data: reqLogs } = await req.client.from("audit_logs").select("id").limit(1);
    assert((reqLogs ?? []).length === 0, "مقدم الطلب يرى سجل التدقيق — خلل صلاحيات");

    const createAttempt = await apiCall(req.token, "admin/users", "POST", {
      full_name: "محاولة اختراق", phone: "0512349999",
      role: "super_admin", location_id: testUsers.requester.locationId,
    });
    assert(!createAttempt.ok, "مقدم الطلب استطاع إنشاء مستخدم — خلل أمني خطير");

    await admin.client.auth.signOut();
    await req.client.auth.signOut();
    return "سجل التدقيق وإنشاء المستخدمين محصوران بمدير النظام";
  });

  // ---------- 9: إنشاء طلب شراء ----------
  let requestId, requestNumber;
  await check(9, "إنشاء طلب شراء مع فاتورة", async () => {
    const { client, userId } = await signIn("966500000002");
    const { data, error } = await client.from("purchase_requests").insert({
      location_id: testUsers.requester.locationId,
      requester_id: userId, status: "draft",
      request_date: new Date().toISOString().slice(0, 10),
      purchase_date: new Date().toISOString().slice(0, 10),
      purchase_type: "operational", priority: "normal",
      supplier_name: `${TAG} مورد تجريبي`, supplier_vat: "310000000000003",
      invoice_number: `${TAG}-INV-${Date.now()}`,
      invoice_date: new Date().toISOString().slice(0, 10),
      amount_before_vat: 1000, vat_amount: 150, total_amount: 1150,
      category: "food", items_description: "أصناف اختبار",
      justification: `${TAG} اختبار قبول`,
    }).select().single();
    if (error) throw new Error(error.message);

    requestId = data.id;
    requestNumber = data.request_number;
    cleanupRequestIds.push(requestId);
    assert(/^PR-\d{4}-\d{5}$/.test(requestNumber),
      `رقم الطلب بصيغة غير متوقعة: ${requestNumber}`);
    await client.auth.signOut();
    return `تم إنشاء الطلب ${requestNumber} بنجاح`;
  });

  // ---------- 10: رفع ومعاينة الفاتورة برابط موقّع ----------
  await check(10, "رفع ومعاينة الفاتورة بتوقيع مؤقت", async () => {
    const { client, token } = await signIn("966500000002");
    const pdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
    );

    const signed = await apiCall(token, "documents/sign-upload", "POST", {
      request_id: requestId, document_type: "supplier_invoice",
      file_name: "invoice.pdf", mime_type: "application/pdf", file_size: pdf.length,
    });
    assert(signed.ok, `تعذر توقيع الرفع: ${JSON.stringify(signed.body)}`);
    assert(signed.body.path.startsWith(testUsers.requester.locationId),
      "مسار الملف لا يبدأ بمعرّف الموقع");

    const up = await client.storage.from("procurement-documents")
      .uploadToSignedUrl(signed.body.path, signed.body.token,
        new Blob([pdf], { type: "application/pdf" }), { contentType: "application/pdf" });
    assert(!up.error, `تعذر الرفع: ${up.error?.message}`);

    const confirmed = await apiCall(token, "documents/confirm-upload", "POST", {
      request_id: requestId, document_type: "supplier_invoice",
      path: signed.body.path, file_name: "invoice.pdf",
    });
    assert(confirmed.ok, `تعذر تأكيد الرفع: ${JSON.stringify(confirmed.body)}`);

    const dl = await apiCall(token, "documents/sign-download", "POST", {
      document_id: confirmed.body.document.id,
    });
    assert(dl.ok && dl.body.signed_url, "تعذر إنشاء رابط المعاينة");
    assert(dl.body.expires_in <= 300, "مدة صلاحية الرابط طويلة جدًا");

    const fetched = await fetch(dl.body.signed_url);
    assert(fetched.ok, "الرابط الموقّع لا يعمل");

    // الرابط دون توقيع يجب أن يُرفض (المخزن خاص)
    const bare = await fetch(
      `${SUPABASE_URL}/storage/v1/object/public/procurement-documents/${signed.body.path}`,
    );
    assert(!bare.ok, "الملف متاح عبر رابط عام — المخزن ليس خاصًا!");

    await client.auth.signOut();
    return `الرفع والمعاينة نجحا برابط صالح ${dl.body.expires_in} ثانية، والوصول العام مرفوض`;
  });

  // ---------- 8: عزل الفروع ----------
  await check(8, "منع مستخدم الفرع من مشاهدة بيانات فرع آخر", async () => {
    const other = await signIn("966500000008");   // فرع BR-02
    const { data } = await other.client.from("purchase_requests")
      .select("id").eq("id", requestId);
    assert((data ?? []).length === 0, "مستخدم فرع آخر يرى الطلب — خلل عزل");

    const { data: docs } = await other.client.from("request_documents")
      .select("id").eq("request_id", requestId);
    assert((docs ?? []).length === 0, "مستخدم فرع آخر يرى مرفقات فرع غيره");

    await other.client.auth.signOut();
    return "مستخدم فرع العليا لا يرى طلبات أو مرفقات فرع الشفا";
  });

  // ---------- 17: منع تكرار الفاتورة ----------
  await check(17, "منع تكرار الفاتورة", async () => {
    const { client, userId } = await signIn("966500000002");
    const { data: orig } = await svc.from("purchase_requests")
      .select("supplier_name, supplier_vat, invoice_number").eq("id", requestId).single();

    const { error } = await client.from("purchase_requests").insert({
      location_id: testUsers.requester.locationId, requester_id: userId,
      status: "draft", request_date: new Date().toISOString().slice(0, 10),
      purchase_type: "operational",
      supplier_name: orig.supplier_name, supplier_vat: orig.supplier_vat,
      invoice_number: orig.invoice_number,
      amount_before_vat: 500, vat_amount: 75, total_amount: 575,
      justification: `${TAG} محاولة تكرار`,
    });
    assert(error, "تم قبول فاتورة مكررة — خلل في التحقق");
    await client.auth.signOut();
    return "رُفضت الفاتورة المكررة لنفس المورد بنفس رقم الفاتورة";
  });

  // ---------- 18: منع الملفات غير المسموحة ----------
  await check(18, "منع الملفات غير المسموحة والأكبر من 10MB", async () => {
    const { client, token } = await signIn("966500000002");

    const exe = await apiCall(token, "documents/sign-upload", "POST", {
      request_id: requestId, document_type: "other",
      file_name: "virus.exe", mime_type: "application/x-msdownload", file_size: 1000,
    });
    assert(!exe.ok, "قُبل ملف تنفيذي — خلل أمني");

    const big = await apiCall(token, "documents/sign-upload", "POST", {
      request_id: requestId, document_type: "other",
      file_name: "big.pdf", mime_type: "application/pdf", file_size: 11 * 1024 * 1024,
    });
    assert(!big.ok, "قُبل ملف أكبر من 10 ميجابايت");

    const spoof = await apiCall(token, "documents/sign-upload", "POST", {
      request_id: requestId, document_type: "other",
      file_name: "invoice.pdf.exe", mime_type: "application/pdf", file_size: 1000,
    });
    assert(!spoof.ok, "قُبل ملف بامتداد مزدوج خادع");

    await client.auth.signOut();
    return "رُفضت الملفات التنفيذية والأكبر من 10MB والامتدادات المزدوجة";
  });

  // ---------- 12: منع الاعتماد خارج الصلاحية ----------
  await check(12, "منع اعتماد مستخدم لمرحلة ليست ضمن صلاحياته", async () => {
    const requester = await signIn("966500000002");
    await requester.client.rpc("submit_purchase_request", { p_request_id: requestId });

    const { error: selfErr } = await requester.client.rpc("decide_purchase_request", {
      p_request_id: requestId, p_decision: "approved", p_note: "محاولة",
    });
    assert(selfErr, "مقدم الطلب استطاع اعتماد طلبه — خلل فصل الصلاحيات");
    await requester.client.auth.signOut();

    // مدير الفرع يحاول الاعتماد قبل دوره
    const bm = await signIn("966500000004");
    const { error: earlyErr } = await bm.client.rpc("decide_purchase_request", {
      p_request_id: requestId, p_decision: "approved", p_note: "قفز مرحلة",
    });
    assert(earlyErr, "مدير الفرع اعتمد قبل مسؤول الإنتاج — خلل ترتيب المراحل");
    await bm.client.auth.signOut();

    // مسؤول إنتاج من فرع آخر
    const foreign = await signIn("966500000008");
    const { error: locErr } = await foreign.client.rpc("decide_purchase_request", {
      p_request_id: requestId, p_decision: "approved", p_note: "فرع آخر",
    });
    assert(locErr, "مستخدم فرع آخر استطاع الاعتماد");
    await foreign.client.auth.signOut();

    return "رُفض اعتماد مقدم الطلب، والقفز فوق المراحل، والاعتماد من فرع آخر";
  });

  // ---------- 11: المسار الخماسي ----------
  await check(11, "انتقال الطلب حسب المراحل الخمس بالترتيب", async () => {
    const steps = [
      ["966500000003", "pending_branch_manager", "مسؤول الإنتاج"],
      ["966500000004", "pending_production_manager", "مدير الفرع"],
      ["966500000005", "pending_procurement", "مدير الإنتاج"],
      ["966500000006", "pending_finance", "المشتريات"],
    ];
    const trace = [];
    for (const [phone, expected, label] of steps) {
      const s = await signIn(phone);
      const { error } = await s.client.rpc("decide_purchase_request", {
        p_request_id: requestId, p_decision: "approved", p_note: `اعتماد ${label}`,
      });
      if (error) throw new Error(`فشل اعتماد ${label}: ${error.message}`);
      const { data } = await svc.from("purchase_requests")
        .select("status").eq("id", requestId).single();
      assert(data.status === expected,
        `بعد ${label} الحالة ${data.status} بدلاً من ${expected}`);
      trace.push(label);
      await s.client.auth.signOut();
    }
    return `المسار سار بالترتيب: ${trace.join(" ← ")} ← المالية`;
  });

  // ---------- 15: منع الإقفال المالي بلا ERP ----------
  await check(15, "منع الاعتماد المالي عند غياب مستند ERP", async () => {
    const fin = await signIn("966500000007");
    const { error } = await fin.client.rpc("decide_purchase_request", {
      p_request_id: requestId, p_decision: "approved", p_note: "إقفال بلا مستند",
    });
    assert(error, "تم الإقفال المالي دون مستند ERP — خلل جوهري");
    assert(String(error.message).includes("ERP") ||
      String(error.message).includes("ERP_DOCUMENT_REQUIRED"),
      `رسالة الخطأ غير متوقعة: ${error.message}`);
    await fin.client.auth.signOut();
    return "رُفض الإقفال المالي لغياب مستند إدخال الفاتورة في ERP";
  });

  // ---------- 16: الإقفال بعد ERP ----------
  await check(16, "نجاح الإقفال بعد إرفاق مستند ERP", async () => {
    const fin = await signIn("966500000007");
    const pdf = Buffer.from("%PDF-1.4\nERP\n%%EOF");

    const signed = await apiCall(fin.token, "documents/sign-upload", "POST", {
      request_id: requestId, document_type: "erp_document",
      file_name: "erp.pdf", mime_type: "application/pdf", file_size: pdf.length,
    });
    assert(signed.ok, `تعذر توقيع رفع مستند ERP: ${JSON.stringify(signed.body)}`);

    const up = await fin.client.storage.from("procurement-documents")
      .uploadToSignedUrl(signed.body.path, signed.body.token,
        new Blob([pdf], { type: "application/pdf" }), { contentType: "application/pdf" });
    assert(!up.error, `تعذر رفع مستند ERP: ${up.error?.message}`);

    const confirmed = await apiCall(fin.token, "documents/confirm-upload", "POST", {
      request_id: requestId, document_type: "erp_document",
      path: signed.body.path, file_name: "erp.pdf",
    });
    assert(confirmed.ok, `تعذر تأكيد مستند ERP: ${JSON.stringify(confirmed.body)}`);

    const { error } = await fin.client.rpc("decide_purchase_request", {
      p_request_id: requestId, p_decision: "approved", p_note: "تم القيد في ERP",
    });
    assert(!error, `فشل الإقفال المالي: ${error?.message}`);

    const { data } = await svc.from("purchase_requests")
      .select("status, completed_at").eq("id", requestId).single();
    assert(data.status === "completed", `الحالة ${data.status} بدلاً من مكتمل`);
    assert(data.completed_at, "تاريخ الاكتمال لم يُسجَّل");

    const { data: apps } = await svc.from("approvals")
      .select("stage, decision").eq("request_id", requestId).eq("decision", "approved");
    assert(apps.length === 5, `عدد الاعتمادات ${apps.length} بدلاً من 5`);

    await fin.client.auth.signOut();
    return "اكتمل الطلب بعد إرفاق مستند ERP، وسُجِّلت المراحل الخمس كلها";
  });

  // ---------- 13 و 14: الرفض والإعادة ----------
  await check(13, "رفض الطلب مع سبب", async () => {
    const { client, userId } = await signIn("966500000002");
    const { data: r2 } = await client.from("purchase_requests").insert({
      location_id: testUsers.requester.locationId, requester_id: userId,
      status: "draft", request_date: new Date().toISOString().slice(0, 10),
      purchase_type: "direct", supplier_name: `${TAG} مورد ٢`,
      invoice_number: `${TAG}-REJ-${Date.now()}`,
      amount_before_vat: 200, vat_amount: 30, total_amount: 230,
      justification: `${TAG} اختبار رفض`,
    }).select().single();
    cleanupRequestIds.push(r2.id);

    await svc.from("request_documents").insert({
      request_id: r2.id, location_id: testUsers.requester.locationId,
      document_type: "supplier_invoice",
      storage_path: `${testUsers.requester.locationId}/${r2.id}/supplier_invoice/acc.pdf`,
      file_name: "acc.pdf", mime_type: "application/pdf", file_size: 1000,
    });
    await client.rpc("submit_purchase_request", { p_request_id: r2.id });
    await client.auth.signOut();

    const po = await signIn("966500000003");
    const { error: noNote } = await po.client.rpc("decide_purchase_request", {
      p_request_id: r2.id, p_decision: "rejected", p_note: null,
    });
    assert(noNote, "قُبل الرفض دون سبب");

    const { error } = await po.client.rpc("decide_purchase_request", {
      p_request_id: r2.id, p_decision: "rejected", p_note: "غير مدرج بالميزانية",
    });
    assert(!error, `فشل الرفض: ${error?.message}`);

    const { data } = await svc.from("approvals").select("note, decision")
      .eq("request_id", r2.id).eq("decision", "rejected").single();
    assert(data.note === "غير مدرج بالميزانية", "سبب الرفض لم يُحفظ");

    await po.client.auth.signOut();
    return "رُفض الرفض بلا سبب، ونجح مع السبب، وحُفظ السبب في سجل الاعتمادات";
  });

  await check(14, "إعادة الطلب للتعديل", async () => {
    const { client, userId } = await signIn("966500000002");
    const { data: r3 } = await client.from("purchase_requests").insert({
      location_id: testUsers.requester.locationId, requester_id: userId,
      status: "draft", request_date: new Date().toISOString().slice(0, 10),
      purchase_type: "direct", supplier_name: `${TAG} مورد ٣`,
      invoice_number: `${TAG}-RET-${Date.now()}`,
      amount_before_vat: 300, vat_amount: 45, total_amount: 345,
      justification: `${TAG} اختبار إعادة`,
    }).select().single();
    cleanupRequestIds.push(r3.id);

    await svc.from("request_documents").insert({
      request_id: r3.id, location_id: testUsers.requester.locationId,
      document_type: "supplier_invoice",
      storage_path: `${testUsers.requester.locationId}/${r3.id}/supplier_invoice/acc3.pdf`,
      file_name: "acc3.pdf", mime_type: "application/pdf", file_size: 1000,
    });
    await client.rpc("submit_purchase_request", { p_request_id: r3.id });
    await client.auth.signOut();

    const po = await signIn("966500000003");
    const { error } = await po.client.rpc("decide_purchase_request", {
      p_request_id: r3.id, p_decision: "returned", p_note: "يرجى إرفاق عرض سعر ثانٍ",
    });
    assert(!error, `فشلت الإعادة: ${error?.message}`);
    await po.client.auth.signOut();

    const back = await signIn("966500000002");
    const { error: editErr } = await back.client.from("purchase_requests")
      .update({ justification: `${TAG} اختبار إعادة — معدّل` }).eq("id", r3.id);
    assert(!editErr, "مقدم الطلب لا يستطيع التعديل بعد الإعادة");

    const { error: resubmitErr } = await back.client
      .rpc("submit_purchase_request", { p_request_id: r3.id });
    assert(!resubmitErr, `تعذرت إعادة الإرسال: ${resubmitErr?.message}`);

    const { data } = await svc.from("purchase_requests")
      .select("status").eq("id", r3.id).single();
    assert(data.status === "pending_production_officer", "لم يعد الطلب للمسار");

    await back.client.auth.signOut();
    return "أُعيد الطلب، وعدّله مقدمه، ثم أعاد إرساله للمسار بنجاح";
  });

  // ---------- 20: الزائر غير المسجّل ----------
  await check(20, "منع المستخدم غير المسجّل من قراءة البيانات", async () => {
    const guest = anonClient();
    const tables = ["purchase_requests", "profiles", "locations",
      "approvals", "audit_logs", "request_documents", "activation_tokens"];
    const leaked = [];
    for (const t of tables) {
      const { data } = await guest.from(t).select("*").limit(1);
      if ((data ?? []).length > 0) leaked.push(t);
    }
    assert(leaked.length === 0, `جداول مكشوفة للزوار: ${leaked.join("، ")}`);

    const api = await apiCall(null, "admin/users", "POST", { full_name: "x" });
    assert(!api.ok, "الواجهة البرمجية تقبل طلبات بلا تسجيل دخول");
    return `الجداول السبعة محجوبة تمامًا عن الزوار، والواجهة البرمجية ترفضهم`;
  });

  // ---------- 21: لا مفاتيح خدمة في الواجهة ----------
  await check(21, "عدم وجود Service Role Key في ملفات الواجهة", async () => {
    const roots = ["out", "src", ".next/static"].filter(existsSync);
    assert(roots.length > 0, "لم يُعثر على مخرجات البناء — نفّذ npm run build أولاً");

    const patterns = [/service_role/i, /SUPABASE_SERVICE_ROLE/i];
    const hits = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) { walk(full); continue; }
        if (!/\.(js|mjs|cjs|ts|tsx|json|html|css|map)$/.test(entry)) continue;
        const content = readFileSync(full, "utf8");
        if (patterns.some((p) => p.test(content))) hits.push(full);
      }
    };
    roots.forEach(walk);
    assert(hits.length === 0, `مفاتيح خدمة مسرّبة في: ${hits.join("، ")}`);
    return `فُحصت ${roots.join("، ")} — لا أثر لمفتاح الخدمة في أي ملف واجهة`;
  });

  // ---------- 25: لا بيانات وهمية ----------
  await check(25, "عدم وجود بيانات Mock في النسخة النهائية", async () => {
    const markers = [/mockData/i, /fakeRequests/i, /dummyUsers/i, /TODO: replace/i];
    const hits = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        const content = readFileSync(full, "utf8");
        if (markers.some((m) => m.test(content))) hits.push(full);
      }
    };
    if (existsSync("src")) walk("src");
    assert(hits.length === 0, `بيانات وهمية في: ${hits.join("، ")}`);

    // قائمة المواقع يجب ألا تكون مكتوبة يدويًا في كود الواجهة
    const hardcoded = [];
    const walkNames = (dir) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walkNames(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        const c = readFileSync(full, "utf8");
        if (c.includes("الشفا") && c.includes("العليا") && c.includes("غرناطة")) {
          hardcoded.push(full);
        }
      }
    };
    if (existsSync("src")) walkNames("src");
    assert(hardcoded.length === 0,
      `قائمة المواقع مكتوبة يدويًا في: ${hardcoded.join("، ")}`);

    return "لا بيانات وهمية، وقائمة المواقع تأتي من قاعدة البيانات فقط";
  });

  // ---------- الاختبارات اليدوية ----------
  manual(19, "التحقق من عمل الواجهة على الجوال والكمبيوتر",
    `افتح ${APP_BASE_URL ?? "<رابط الواجهة>"} على جوال ومتصفح سطح مكتب. ` +
    "الواجهة متجاوبة (Tailwind responsive) والقائمة تتحول لقائمة منسدلة تحت 1024 بكسل.");

  manual(22, "تشغيل Security Advisor ومعالجة التحذيرات",
    "Supabase Dashboard → Advisors → Security Advisor. " +
    "الهجرات تفعّل RLS على كل جداول public وتثبّت search_path لكل دالة.");

  manual(23, "اختبار الرابط المنشور في نافذة خاصة",
    `افتح ${APP_BASE_URL ?? "<رابط الواجهة>"} في نافذة تصفح خاص ` +
    "في Safari و Chrome. يجب أن تظهر صفحة الدخول دون أي حساب ChatGPT.");

  manual(24, "اختبار جميع الأزرار والنماذج والمرشحات",
    "راجع قائمة الشاشات الـ13 في README وجرّب كل زر ومرشّح. " +
    "الاختبارات الآلية أعلاه تغطي منطق العمل خلف كل زر.");

} finally {
  console.log("\n▸ تنظيف بيانات الاختبار…");
  await cleanup();
  console.log("  تم حذف المستخدمين والطلبات التجريبية.\n");
}

// ------------------------------------------------------------------ الخلاصة
const auto = results.filter((r) => !r.manual);
const passed = auto.filter((r) => r.ok).length;
const failed = auto.filter((r) => !r.ok);

console.log("═".repeat(66));
console.log(`  آلي: ${passed}/${auto.length} نجح   |   يدوي: ${results.filter((r) => r.manual).length}`);
console.log("═".repeat(66));

if (failed.length) {
  console.log("\nالاختبارات الفاشلة:");
  failed.forEach((f) => console.log(`  ❌ ${f.test}\n     ${f.detail}`));
  process.exit(1);
}
console.log("\n✅ نجحت جميع اختبارات القبول الآلية.\n");
