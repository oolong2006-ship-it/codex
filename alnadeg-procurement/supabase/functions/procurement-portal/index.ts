// =====================================================================
// procurement-portal — واجهة برمجية (API) لبوابة مشتريات الناضج
//
// ملاحظة مهمة: هذه الدالة تخدم JSON فقط ولا تُعيد صفحات HTML.
// استضافة الواجهة تتم على منصة Frontend مستقلة، لأن Edge Functions
// تعيد النص بنوع text/plain مع سياسة CSP تمنع تشغيل JavaScript.
//
// المسارات:
//   GET  /procurement-portal/health
//   GET  /procurement-portal/activation/verify?token=...
//   POST /procurement-portal/activate
//   POST /procurement-portal/admin/users
//   PATCH/procurement-portal/admin/users/:id
//   POST /procurement-portal/admin/users/:id/reset-password
//   POST /procurement-portal/documents/sign-upload
//   POST /procurement-portal/documents/confirm-upload
//   POST /procurement-portal/documents/sign-download
//   POST /procurement-portal/reports/export
// =====================================================================
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { AppError, clientIp, corsHeaders, handleError, json } from "../_shared/http.ts";
import {
  checkFile,
  checkPassword,
  DOCUMENT_TYPES,
  isValidSaudiVat,
  normalizeSaudiPhone,
} from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "procurement-documents";
const EMAIL_DOMAIN = "phone.alnadeg.local";

/** عميل بصلاحية الخدمة — لا يُسرَّب مفتاحه أبدًا خارج هذه الدالة */
function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Caller {
  id: string;
  role: string;
  location_id: string | null;
  full_name: string;
  is_active: boolean;
}

/**
 * يتحقق من هوية المستدعي عبر رمز الدخول، ثم يقرأ دوره من قاعدة البيانات.
 * لا نعتمد على user_metadata إطلاقًا في قرارات الصلاحية.
 */
async function requireCaller(req: Request, svc: SupabaseClient): Promise<Caller> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new AppError("NO_TOKEN", "يجب تسجيل الدخول أولاً", 401);

  const { data: userData, error } = await svc.auth.getUser(token);
  if (error || !userData?.user) {
    throw new AppError("BAD_TOKEN", "انتهت الجلسة، يرجى تسجيل الدخول من جديد", 401);
  }

  const { data: profile } = await svc.from("profiles")
    .select("id, role, location_id, full_name, is_active")
    .eq("id", userData.user.id).single();

  if (!profile) throw new AppError("NO_PROFILE", "لا يوجد ملف مستخدم لهذا الحساب", 403);
  if (!profile.is_active) {
    throw new AppError("INACTIVE", "الحساب معطّل، يرجى مراجعة مدير النظام", 403);
  }
  return profile as Caller;
}

function requireSuperAdmin(caller: Caller): void {
  if (caller.role !== "super_admin") {
    throw new AppError("FORBIDDEN", "هذه العملية متاحة لمدير النظام فقط", 403);
  }
}

async function rateLimit(
  svc: SupabaseClient, bucket: string, id: string, windowSec: number, max: number,
): Promise<void> {
  const { data, error } = await svc.rpc("rate_limit_hit", {
    p_bucket: bucket, p_identifier: id, p_window_seconds: windowSec, p_max_hits: max,
  });
  // في حال تعذّر الفحص لا نمنع الخدمة، لكن نسجّل التحذير
  if (error) { console.warn("[rate-limit] unavailable:", error.message); return; }
  if (data === false) {
    throw new AppError("RATE_LIMITED", "محاولات كثيرة جدًا، يرجى المحاولة بعد قليل", 429);
  }
}

/** توليد كلمة مرور مؤقتة قوية تُعرض لمدير النظام مرة واحدة فقط */
function tempPassword(): string {
  const lower = "abcdefghijkmnpqrstuvwxyz", upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789", symbols = "!@#$%^&*";
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// =====================================================================
// المسارات
// =====================================================================

/** GET /activation/verify?token=... — فحص الرمز دون استهلاكه */
async function verifyActivation(url: URL, svc: SupabaseClient, ip: string) {
  await rateLimit(svc, "activation_verify", ip, 900, 30);
  const token = url.searchParams.get("token") ?? "";
  if (!token) throw new AppError("NO_TOKEN", "رابط التفعيل غير مكتمل", 400);

  const { data, error } = await svc.rpc("peek_activation_token", {
    p_token_hash: await sha256Hex(token),
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.valid) {
    const reasons: Record<string, string> = {
      NOT_FOUND: "رابط التفعيل غير صحيح",
      ALREADY_USED: "تم استخدام رابط التفعيل مسبقًا",
      EXPIRED: "انتهت صلاحية رابط التفعيل، اطلب رابطًا جديدًا",
    };
    throw new AppError(row?.reason ?? "INVALID",
      reasons[row?.reason] ?? "رابط التفعيل غير صالح", 400);
  }
  // نعيد الاسم ورقم الجوال مقنّعًا لتعبئة النموذج دون كشف كامل
  return {
    valid: true,
    full_name: row.full_name,
    phone_masked: String(row.phone).replace(/^(966\d{2})\d{4}(\d{2})$/, "$1****$2"),
    role: row.role,
  };
}

/** POST /activate — تفعيل حساب مدير النظام لمرة واحدة */
async function activate(req: Request, svc: SupabaseClient, ip: string) {
  await rateLimit(svc, "activate", ip, 900, 10);
  const body = await req.json().catch(() => ({}));
  const { token, full_name, phone, password, password_confirm } = body ?? {};

  if (!token) throw new AppError("NO_TOKEN", "رابط التفعيل غير مكتمل", 400);
  if (!full_name || String(full_name).trim().length < 4) {
    throw new AppError("BAD_NAME", "يرجى إدخال الاسم الكامل", 400);
  }
  if (password !== password_confirm) {
    throw new AppError("MISMATCH", "كلمة المرور وتأكيدها غير متطابقين", 400);
  }

  const normalized = normalizeSaudiPhone(phone);
  if (!normalized) throw new AppError("BAD_PHONE", "رقم الجوال غير صحيح", 400);

  const pw = checkPassword(String(password), normalized);
  if (!pw.ok) throw new AppError("WEAK_PASSWORD", pw.problems.join("، "), 400);

  const hash = await sha256Hex(String(token));

  // فحص مبدئي: الرمز يجب أن يطابق رقم الجوال المدخل
  const { data: peek } = await svc.rpc("peek_activation_token", { p_token_hash: hash });
  const peeked = Array.isArray(peek) ? peek[0] : peek;
  if (!peeked?.valid) {
    throw new AppError("TOKEN_INVALID",
      "رابط التفعيل غير صالح أو منتهي الصلاحية أو مستخدم مسبقًا", 400);
  }
  if (peeked.phone !== normalized) {
    throw new AppError("PHONE_MISMATCH", "رقم الجوال لا يطابق رابط التفعيل", 400);
  }

  // حجز ذرّي: يضمن أن طلبين متزامنين لا ينشئان حسابين
  const { error: claimErr } = await svc.rpc("claim_activation_token", { p_token_hash: hash });
  if (claimErr) {
    throw new AppError("TOKEN_INVALID",
      "رابط التفعيل غير صالح أو منتهي الصلاحية أو مستخدم مسبقًا", 400);
  }

  const email = `${normalized}@${EMAIL_DOMAIN}`;
  try {
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
      // الدور يُخزَّن في app_metadata (لا يمكن للمستخدم تعديله)
      app_metadata: { role: peeked.role, provider: "email" },
      user_metadata: { full_name: String(full_name).trim() },
    });
    if (createErr || !created?.user) throw new Error(createErr?.message ?? "create failed");

    const { error: profileErr } = await svc.rpc("complete_activation", {
      p_token_hash: hash,
      p_user_id: created.user.id,
      p_full_name: String(full_name).trim(),
      p_phone: normalized,
    });
    if (profileErr) {
      await svc.auth.admin.deleteUser(created.user.id).catch(() => {});
      throw new Error(profileErr.message);
    }

    return { success: true, message: "تم تفعيل الحساب بنجاح، يمكنك تسجيل الدخول الآن" };
  } catch (e) {
    // تحرير الحجز حتى لا يضيع الرمز بسبب فشل تقني
    await svc.rpc("release_activation_token", { p_token_hash: hash }).catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already been registered") || msg.includes("duplicate")) {
      throw new AppError("USER_EXISTS", "يوجد حساب مسجّل بهذا الرقم مسبقًا", 409);
    }
    throw e;
  }
}

/** POST /admin/users — إنشاء مستخدم بواسطة مدير النظام */
async function createUser(req: Request, svc: SupabaseClient, caller: Caller, ip: string) {
  requireSuperAdmin(caller);
  const b = await req.json().catch(() => ({}));
  const { full_name, phone, role, location_id, job_title } = b ?? {};

  const VALID_ROLES = ["super_admin", "requester", "production_officer",
    "branch_manager", "production_manager", "procurement", "finance"];
  if (!VALID_ROLES.includes(role)) throw new AppError("BAD_ROLE", "الدور المحدد غير صحيح", 400);
  if (!full_name || String(full_name).trim().length < 4) {
    throw new AppError("BAD_NAME", "يرجى إدخال الاسم الكامل", 400);
  }

  const normalized = normalizeSaudiPhone(phone);
  if (!normalized) throw new AppError("BAD_PHONE", "رقم الجوال غير صحيح", 400);

  if (!location_id) throw new AppError("NO_LOCATION", "يجب تحديد الموقع أو الفرع", 400);
  const { data: loc } = await svc.from("locations")
    .select("id, is_active").eq("id", location_id).single();
  if (!loc || !loc.is_active) throw new AppError("BAD_LOCATION", "الموقع المحدد غير صحيح", 400);

  const { data: existing } = await svc.from("profiles")
    .select("id").eq("phone", normalized).maybeSingle();
  if (existing) throw new AppError("PHONE_EXISTS", "رقم الجوال مسجّل مسبقًا لمستخدم آخر", 409);

  const temp = tempPassword();
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email: `${normalized}@${EMAIL_DOMAIN}`,
    password: temp,
    email_confirm: true,
    app_metadata: { role, provider: "email" },
    user_metadata: { full_name: String(full_name).trim() },
  });
  if (createErr || !created?.user) {
    if (String(createErr?.message).includes("already been registered")) {
      throw new AppError("PHONE_EXISTS", "رقم الجوال مسجّل مسبقًا لمستخدم آخر", 409);
    }
    throw new Error(createErr?.message ?? "create failed");
  }

  const { error: profErr } = await svc.from("profiles").insert({
    id: created.user.id,
    full_name: String(full_name).trim(),
    phone: normalized,
    role,
    location_id,
    job_title: job_title ?? null,
    is_active: true,
    must_change_password: true, // إجبار تغيير كلمة المرور المؤقتة
  });
  if (profErr) {
    await svc.auth.admin.deleteUser(created.user.id).catch(() => {});
    throw new Error(profErr.message);
  }

  await svc.rpc("log_admin_action", {
    p_actor: caller.id, p_action: "user.created", p_entity_type: "profile",
    p_entity_id: created.user.id,
    p_details: { full_name, phone: normalized, role, location_id }, p_ip: ip,
  });

  // كلمة المرور المؤقتة تُعرض مرة واحدة فقط ولا تُخزَّن في أي مكان
  return {
    success: true,
    user_id: created.user.id,
    temp_password: temp,
    message: "تم إنشاء المستخدم. سلّمه كلمة المرور المؤقتة، وسيُطلب منه تغييرها عند أول دخول.",
  };
}

/** PATCH /admin/users/:id — تعديل بيانات المستخدم */
async function updateUser(
  req: Request, svc: SupabaseClient, caller: Caller, userId: string, ip: string,
) {
  requireSuperAdmin(caller);
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (b.full_name !== undefined) {
    if (String(b.full_name).trim().length < 4) {
      throw new AppError("BAD_NAME", "يرجى إدخال الاسم الكامل", 400);
    }
    patch.full_name = String(b.full_name).trim();
  }
  if (b.role !== undefined) {
    const VALID_ROLES = ["super_admin", "requester", "production_officer",
      "branch_manager", "production_manager", "procurement", "finance"];
    if (!VALID_ROLES.includes(b.role)) throw new AppError("BAD_ROLE", "الدور المحدد غير صحيح", 400);
    patch.role = b.role;
  }
  if (b.location_id !== undefined) patch.location_id = b.location_id;
  if (b.job_title !== undefined) patch.job_title = b.job_title;
  if (b.is_active !== undefined) patch.is_active = !!b.is_active;

  if (b.phone !== undefined) {
    const normalized = normalizeSaudiPhone(b.phone);
    if (!normalized) throw new AppError("BAD_PHONE", "رقم الجوال غير صحيح", 400);
    patch.phone = normalized;
    await svc.auth.admin.updateUserById(userId, { email: `${normalized}@${EMAIL_DOMAIN}` });
  }

  if (caller.id === userId && patch.is_active === false) {
    throw new AppError("SELF_DISABLE", "لا يمكنك تعطيل حسابك الخاص", 400);
  }
  if (Object.keys(patch).length === 0) {
    throw new AppError("NO_CHANGES", "لا توجد تغييرات للحفظ", 400);
  }

  const { error } = await svc.from("profiles").update(patch).eq("id", userId);
  if (error) throw new Error(error.message);

  // الدور يبقى متزامنًا مع app_metadata
  if (patch.role) {
    await svc.auth.admin.updateUserById(userId, { app_metadata: { role: patch.role } });
  }
  // تعطيل الحساب يمنع الدخول فورًا عبر حظر المستخدم في Auth
  if (patch.is_active !== undefined) {
    await svc.auth.admin.updateUserById(userId, {
      ban_duration: patch.is_active ? "none" : "876000h",
    });
  }

  await svc.rpc("log_admin_action", {
    p_actor: caller.id, p_action: "user.updated", p_entity_type: "profile",
    p_entity_id: userId, p_details: patch, p_ip: ip,
  });
  return { success: true, message: "تم حفظ التعديلات" };
}

/** POST /admin/users/:id/reset-password — إعادة تعيين آمنة */
async function resetPassword(
  svc: SupabaseClient, caller: Caller, userId: string, ip: string,
) {
  requireSuperAdmin(caller);
  const temp = tempPassword();
  const { error } = await svc.auth.admin.updateUserById(userId, { password: temp });
  if (error) throw new Error(error.message);

  await svc.from("profiles").update({ must_change_password: true }).eq("id", userId);
  await svc.rpc("log_admin_action", {
    p_actor: caller.id, p_action: "user.password_reset", p_entity_type: "profile",
    p_entity_id: userId, p_details: {}, p_ip: ip,
  });

  return {
    success: true,
    temp_password: temp,
    message: "تم إنشاء كلمة مرور مؤقتة. سيُطلب من المستخدم تغييرها عند أول دخول.",
  };
}

/** يتأكد أن المستدعي يملك صلاحية على الطلب */
async function requestForCaller(svc: SupabaseClient, caller: Caller, requestId: string) {
  const { data: r } = await svc.from("purchase_requests")
    .select("id, location_id, requester_id, status, current_stage")
    .eq("id", requestId).single();
  if (!r) throw new AppError("NOT_FOUND", "الطلب غير موجود", 404);

  const globalScope = ["super_admin", "production_manager", "procurement", "finance"]
    .includes(caller.role);
  const allowed = globalScope || r.requester_id === caller.id ||
    r.location_id === caller.location_id;
  if (!allowed) throw new AppError("FORBIDDEN", "لا تملك صلاحية على هذا الطلب", 403);
  return r;
}

/** POST /documents/sign-upload — رابط رفع موقّع بعد التحقق من الصلاحية والنوع */
async function signUpload(req: Request, svc: SupabaseClient, caller: Caller) {
  const b = await req.json().catch(() => ({}));
  const { request_id, document_type, file_name, mime_type, file_size } = b ?? {};

  if (!DOCUMENT_TYPES.includes(document_type)) {
    throw new AppError("BAD_TYPE", "نوع المستند غير معروف", 400);
  }
  const fc = checkFile(String(file_name ?? ""), String(mime_type ?? ""), Number(file_size));
  if (!fc.ok) throw new AppError("BAD_FILE", fc.error!, 400);

  const r = await requestForCaller(svc, caller, String(request_id));

  // من يحق له الرفع ومتى
  const isOwnerEditable = r.requester_id === caller.id &&
    ["draft", "returned"].includes(r.status);
  const isBackOffice = ["finance", "procurement"].includes(caller.role) &&
    ["erp_document", "other"].includes(document_type);
  if (!(isOwnerEditable || isBackOffice || caller.role === "super_admin")) {
    throw new AppError("FORBIDDEN", "لا تملك صلاحية إرفاق مستند لهذا الطلب الآن", 403);
  }

  // المسار لا يعتمد على اسم المستخدم: location_id/request_id/document_type/uuid.ext
  const path = `${r.location_id}/${r.id}/${document_type}/${crypto.randomUUID()}.${fc.ext}`;
  const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);

  return { path, token: data.token, signed_url: data.signedUrl };
}

/**
 * POST /documents/confirm-upload — تسجيل المرفق بعد التحقق من الملف فعليًا
 * على الخادم (الحجم والنوع يُقرآن من المخزن لا من الواجهة).
 */
async function confirmUpload(req: Request, svc: SupabaseClient, caller: Caller, ip: string) {
  const b = await req.json().catch(() => ({}));
  const { request_id, document_type, path, file_name } = b ?? {};
  if (!path || typeof path !== "string") throw new AppError("BAD_PATH", "مسار الملف غير صحيح", 400);

  const r = await requestForCaller(svc, caller, String(request_id));
  if (!path.startsWith(`${r.location_id}/${r.id}/${document_type}/`)) {
    throw new AppError("BAD_PATH", "مسار الملف لا يطابق الطلب", 400);
  }

  // التحقق الحقيقي من البيانات الوصفية في المخزن
  const folder = path.split("/").slice(0, -1).join("/");
  const fileName = path.split("/").pop()!;
  const { data: listed, error: listErr } = await svc.storage.from(BUCKET)
    .list(folder, { search: fileName });
  if (listErr) throw new Error(listErr.message);

  const obj = listed?.find((o) => o.name === fileName);
  if (!obj) throw new AppError("NOT_UPLOADED", "لم يتم العثور على الملف المرفوع", 400);

  const size = Number(obj.metadata?.size ?? 0);
  const mime = String(obj.metadata?.mimetype ?? "");
  const verified = checkFile(fileName, mime, size);
  if (!verified.ok) {
    // ملف مخالف يُحذف فورًا من المخزن
    await svc.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new AppError("BAD_FILE", verified.error!, 400);
  }

  const { data: doc, error } = await svc.from("request_documents").insert({
    request_id: r.id,
    location_id: r.location_id,
    document_type,
    storage_path: path,
    file_name: String(file_name ?? fileName).slice(0, 200),
    mime_type: mime,
    file_size: size,
    uploaded_by: caller.id,
  }).select().single();
  if (error) {
    await svc.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(error.message);
  }

  await svc.rpc("log_admin_action", {
    p_actor: caller.id, p_action: "document.uploaded", p_entity_type: "request_document",
    p_entity_id: doc.id, p_details: { request_id: r.id, document_type, size }, p_ip: ip,
  });
  return { success: true, document: doc };
}

/** POST /documents/sign-download — رابط معاينة قصير الصلاحية */
async function signDownload(req: Request, svc: SupabaseClient, caller: Caller) {
  const b = await req.json().catch(() => ({}));
  const { document_id } = b ?? {};

  const { data: doc } = await svc.from("request_documents")
    .select("id, request_id, storage_path, file_name").eq("id", document_id).single();
  if (!doc) throw new AppError("NOT_FOUND", "المستند غير موجود", 404);

  await requestForCaller(svc, caller, doc.request_id);

  // صلاحية 60 ثانية فقط — لا روابط عامة دائمة
  const { data, error } = await svc.storage.from(BUCKET)
    .createSignedUrl(doc.storage_path, 60, { download: false });
  if (error) throw new Error(error.message);

  return { signed_url: data.signedUrl, expires_in: 60, file_name: doc.file_name };
}

/** POST /reports/export — تصدير CSV ضمن نطاق صلاحية المستدعي */
async function exportReport(req: Request, svc: SupabaseClient, caller: Caller, ip: string) {
  const b = await req.json().catch(() => ({}));
  const { status, location_id, date_from, date_to } = b ?? {};

  let q = svc.from("purchase_requests").select(
    `request_number, status, current_stage, request_date, purchase_date, purchase_type,
     priority, supplier_name, supplier_vat, invoice_number, invoice_date,
     amount_before_vat, vat_amount, total_amount, category, items_description,
     justification, locations(name_ar), profiles!purchase_requests_requester_fk(full_name)`,
  ).order("created_at", { ascending: false }).limit(5000);

  const globalScope = ["super_admin", "production_manager", "procurement", "finance"]
    .includes(caller.role);
  if (!globalScope) q = q.eq("location_id", caller.location_id!);
  else if (location_id) q = q.eq("location_id", location_id);

  if (status) q = q.eq("status", status);
  if (date_from) q = q.gte("request_date", date_from);
  if (date_to) q = q.lte("request_date", date_to);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const headers = [
    "رقم الطلب", "الحالة", "المرحلة", "تاريخ الطلب", "تاريخ الشراء", "نوع الشراء",
    "الأولوية", "الموقع", "مقدم الطلب", "المورد", "الرقم الضريبي", "رقم الفاتورة",
    "تاريخ الفاتورة", "قبل الضريبة", "الضريبة", "الإجمالي", "الفئة", "الوصف", "المبرر",
  ];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = (data ?? []).map((r: Record<string, any>) => [
    r.request_number, r.status, r.current_stage, r.request_date, r.purchase_date,
    r.purchase_type, r.priority, r.locations?.name_ar, r.profiles?.full_name,
    r.supplier_name, r.supplier_vat, r.invoice_number, r.invoice_date,
    r.amount_before_vat, r.vat_amount, r.total_amount, r.category,
    r.items_description, r.justification,
  ].map(esc).join(","));

  await svc.rpc("log_admin_action", {
    p_actor: caller.id, p_action: "report.exported", p_entity_type: "report",
    p_entity_id: "purchase_requests", p_details: { count: rows.length }, p_ip: ip,
  });

  // BOM لضمان قراءة العربية بشكل صحيح في Excel
  return "﻿" + [headers.join(","), ...rows].join("\n");
}

// =====================================================================
// الموجّه الرئيسي
// =====================================================================
Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    // إسقاط اسم الدالة من المسار
    if (parts[0] === "procurement-portal") parts.shift();
    const route = parts.join("/");
    const svc = serviceClient();
    const ip = clientIp(req);

    // --- مسارات عامة (بلا تسجيل دخول) ---
    if (route === "health" && req.method === "GET") {
      return json({ ok: true, service: "procurement-portal" }, 200, origin);
    }
    if (route === "activation/verify" && req.method === "GET") {
      return json(await verifyActivation(url, svc, ip), 200, origin);
    }
    if (route === "activate" && req.method === "POST") {
      return json(await activate(req, svc, ip), 200, origin);
    }

    // --- ما بعده يتطلب تسجيل دخول ---
    const caller = await requireCaller(req, svc);

    if (route === "admin/users" && req.method === "POST") {
      return json(await createUser(req, svc, caller, ip), 200, origin);
    }
    if (parts[0] === "admin" && parts[1] === "users" && parts[2]) {
      if (parts[3] === "reset-password" && req.method === "POST") {
        return json(await resetPassword(svc, caller, parts[2], ip), 200, origin);
      }
      if (!parts[3] && req.method === "PATCH") {
        return json(await updateUser(req, svc, caller, parts[2], ip), 200, origin);
      }
    }
    if (route === "documents/sign-upload" && req.method === "POST") {
      return json(await signUpload(req, svc, caller), 200, origin);
    }
    if (route === "documents/confirm-upload" && req.method === "POST") {
      return json(await confirmUpload(req, svc, caller, ip), 200, origin);
    }
    if (route === "documents/sign-download" && req.method === "POST") {
      return json(await signDownload(req, svc, caller), 200, origin);
    }
    if (route === "reports/export" && req.method === "POST") {
      const csv = await exportReport(req, svc, caller, ip);
      return new Response(csv, {
        status: 200,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="purchase-requests.csv"`,
        },
      });
    }

    return json({ error: "المسار غير موجود", code: "NOT_FOUND" }, 404, origin);
  } catch (err) {
    return handleError(err, origin);
  }
});
