"use client";
import { API_BASE, supabase } from "./supabase";

/** خطأ يحمل رسالة عربية جاهزة للعرض */
export class ApiError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** استدعاء الواجهة البرمجية مع ترجمة الأخطاء إلى العربية */
export async function callApi<T>(
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = init;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) Object.assign(headers, await authHeaders());

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت", "NETWORK");
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/csv")) {
    return (await res.text()) as unknown as T;
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      payload?.error ?? "تعذر تنفيذ العملية، يرجى المحاولة لاحقًا",
      payload?.code, res.status,
    );
  }
  return payload as T;
}

// ---------------------------------------------------------------------
// عمليات المرفقات
// ---------------------------------------------------------------------

export interface SignedUpload { path: string; token: string; signed_url: string }

/** يرفع مرفقًا: توقيع → رفع → تأكيد وتحقق من جهة الخادم */
export async function uploadDocument(
  requestId: string,
  documentType: string,
  file: File,
  onProgress?: (stage: string) => void,
): Promise<void> {
  onProgress?.("جارٍ تجهيز الرفع…");
  const signed = await callApi<SignedUpload>("documents/sign-upload", {
    method: "POST",
    body: {
      request_id: requestId,
      document_type: documentType,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
    },
  });

  onProgress?.("جارٍ رفع الملف…");
  const { supabase: sb } = await import("./supabase");
  const { error } = await sb.storage
    .from("procurement-documents")
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type, upsert: false,
    });
  if (error) throw new ApiError("تعذر رفع الملف، يرجى المحاولة مرة أخرى", "UPLOAD_FAILED");

  onProgress?.("جارٍ التحقق من الملف…");
  await callApi("documents/confirm-upload", {
    method: "POST",
    body: {
      request_id: requestId,
      document_type: documentType,
      path: signed.path,
      file_name: file.name,
    },
  });
}

/** رابط معاينة قصير الصلاحية (60 ثانية) */
export async function getDocumentUrl(documentId: string): Promise<string> {
  const res = await callApi<{ signed_url: string }>("documents/sign-download", {
    method: "POST",
    body: { document_id: documentId },
  });
  return res.signed_url;
}

// ---------------------------------------------------------------------
// عمليات إدارة المستخدمين
// ---------------------------------------------------------------------

export interface CreatedUser {
  user_id: string; temp_password: string; message: string;
}

export function createUser(input: {
  full_name: string; phone: string; role: string;
  location_id: string; job_title?: string;
}): Promise<CreatedUser> {
  return callApi<CreatedUser>("admin/users", { method: "POST", body: input });
}

export function updateUser(
  userId: string,
  patch: Record<string, unknown>,
): Promise<{ success: boolean; message: string }> {
  return callApi(`admin/users/${userId}`, { method: "PATCH", body: patch });
}

export function resetUserPassword(
  userId: string,
): Promise<{ temp_password: string; message: string }> {
  return callApi(`admin/users/${userId}/reset-password`, { method: "POST" });
}

// ---------------------------------------------------------------------
// التفعيل
// ---------------------------------------------------------------------

export interface ActivationInfo {
  valid: boolean; full_name: string; phone_masked: string; role: string;
}

export function verifyActivationToken(token: string): Promise<ActivationInfo> {
  return callApi<ActivationInfo>(
    `activation/verify?token=${encodeURIComponent(token)}`, { auth: false },
  );
}

export function activateAccount(input: {
  token: string; full_name: string; phone: string;
  password: string; password_confirm: string;
}): Promise<{ success: boolean; message: string }> {
  return callApi("activate", { method: "POST", body: input, auth: false });
}

// ---------------------------------------------------------------------
// التقارير
// ---------------------------------------------------------------------

export function exportRequestsCsv(filters: {
  status?: string; location_id?: string; date_from?: string; date_to?: string;
}): Promise<string> {
  return callApi<string>("reports/export", { method: "POST", body: filters });
}
