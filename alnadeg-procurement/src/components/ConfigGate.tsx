"use client";
import { useEffect, useState } from "react";
import { isConfigured, saveConfig } from "@/lib/supabase";
import { Alert, Button, Field, Input, Spinner } from "./ui";

/** يقرأ ادعاء الدور من داخل رمز JWT دون التحقق من توقيعه */
function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json);
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

const DEFAULT_URL = "https://wdtylpgeyjuetarwtbev.supabase.co";

/**
 * تعرض شاشة الربط إذا لم تُضبط إعدادات الاتصال بعد.
 * الفحص يتم بعد التركيب لا أثناء التصيير المسبق، تفاديًا لاختلاف
 * الترطيب بين HTML المبني مسبقًا وما يراه المتصفح.
 */
export function ConfigGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "ready" | "setup">("checking");

  useEffect(() => {
    setState(isConfigured() ? "ready" : "setup");
  }, []);

  if (state === "checking") return <Spinner label="جارٍ فتح البوابة…" />;
  if (state === "setup") return <SetupScreen onSaved={() => window.location.reload()} />;
  return <>{children}</>;
}

function SetupScreen({ onSaved }: { onSaved: () => void }) {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUrl = url.trim().replace(/\/$/, "");
    const cleanKey = key.trim();

    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(cleanUrl)) {
      setError("عنوان المشروع غير صحيح. الصيغة: https://xxxxx.supabase.co");
      return;
    }
    if (cleanKey.length < 20) {
      setError("المفتاح قصير جدًا — تأكد من نسخه كاملًا");
      return;
    }
    // فحص فعلي للدور داخل المفتاح — يكشف المفتاح السرّي مهما كان شكله
    const role = jwtRole(cleanKey);
    if (cleanKey.startsWith("sb_secret") || (role !== null && role !== "anon")) {
      setError(
        "هذا مفتاح سرّي ولا يجوز وضعه في صفحة علنية. استخدم المفتاح العام anon.",
      );
      return;
    }

    setBusy(true);
    try {
      // تحقق فعلي من أن المفتاح يعمل قبل حفظه
      const res = await fetch(`${cleanUrl}/rest/v1/`, {
        headers: { apikey: cleanKey, Authorization: `Bearer ${cleanKey}` },
      });
      if (res.status === 401 || res.status === 403) {
        setError("المفتاح غير مقبول من المشروع. تأكد أنه مفتاح anon العام لهذا المشروع.");
        setBusy(false);
        return;
      }
      saveConfig(cleanUrl, cleanKey);
      onSaved();
    } catch {
      setError("تعذر الوصول إلى المشروع. تحقق من العنوان ومن اتصالك بالإنترنت.");
      setBusy(false);
    }
  };

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-gradient-to-bl
                               from-brand-800 via-brand-700 to-brand-900 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl
                           bg-white/10 text-3xl font-extrabold text-gold-300 ring-1 ring-white/20">
            ن
          </span>
          <h1 className="mt-3 text-xl font-extrabold text-white">بوابة مشتريات الناضج</h1>
          <p className="mt-1 text-sm text-brand-100">خطوة واحدة متبقية لربط البوابة بقاعدتك</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h2 className="mb-1 text-lg font-bold text-brand-800">ربط البوابة</h2>
          <p className="mb-6 text-sm text-slate-500">
            البوابة منشورة وتعمل، لكنها لا تعرف بعد أي قاعدة بيانات تخاطب.
            الصق القيمتين من لوحة Supabase.
          </p>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <Alert tone="error">{error}</Alert>}

            <Field label="عنوان المشروع" required
              hint="Supabase ← Project Settings ← API ← Project URL">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} dir="ltr"
                placeholder="https://xxxxx.supabase.co" />
            </Field>

            <Field label="المفتاح العام" required
              hint="Supabase ← Project Settings ← API ← مفتاح anon public">
              <Input value={key} onChange={(e) => setKey(e.target.value)} dir="ltr"
                placeholder="eyJhbGciOi…" />
            </Field>

            <Alert tone="warning">
              <b className="block">لا تستخدم مفتاح service_role هنا</b>
              المطلوب هو <span dir="ltr">anon public</span> — وهو مفتاح مخصص للنشر
              العلني ومحمي بسياسات الحماية داخل قاعدة البيانات.
            </Alert>

            <Button type="submit" full loading={busy}>ربط البوابة</Button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            <p>
              <b className="text-slate-600">ملاحظة:</b> هذا الربط يُحفظ في هذا المتصفح
              فقط، ويكفي لتجربة البوابة والتحقق من عملها.
            </p>
            <p className="mt-2">
              لتفعيلها لجميع الموظفين دون أن يكرر كل واحد هذه الخطوة، أضف السر
              <code dir="ltr" className="mx-1 rounded bg-slate-100 px-1.5 py-0.5">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>
              في إعدادات المستودع على GitHub، وسيُبنى الموقع مرتبطًا تلقائيًا.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
