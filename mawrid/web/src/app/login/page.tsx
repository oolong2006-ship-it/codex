"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isConfigured } from "@/lib/supabase";
import { Wordmark } from "@/components/Brand";
import { NotConfigured } from "@/components/NotConfigured";
import { Button, Field, Notice } from "@/components/ui";

export default function LoginPage() {
  const { signIn, sendReset, session, profile, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session && profile?.is_active) router.replace("/suppliers/");
  }, [loading, session, profile, router]);

  if (!isConfigured) return <NotConfigured />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfo(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("اكتب بريداً إلكترونياً صحيحاً"); return; }
    if (mode === "login" && !password) { setError("اكتب كلمة المرور"); return; }
    setBusy(true);
    try {
      if (mode === "login") await signIn(email, password);
      else {
        await sendReset(email);
        setInfo("إن كان البريد مسجلاً فستصلك رسالة برابط لتعيين كلمة مرور جديدة.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-brand px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-brand-ink">
          <Wordmark className="text-[52px]" />
          <p className="mt-2 text-[15px] opacity-85">دليل موردي الهوريكا في المملكة</p>
        </div>
        <form onSubmit={submit} noValidate className="rounded-2xl bg-surface p-6 shadow-xl sm:p-8">
          <h1 className="mb-1 text-lg font-bold">{mode === "login" ? "تسجيل الدخول" : "استعادة كلمة المرور"}</h1>
          <p className="mb-5 text-sm text-muted">
            {mode === "login" ? "لفريق المشتريات. الحسابات يُنشئها مدير النظام." : "أدخل بريدك وسنرسل لك رابطاً."}
          </p>
          {error && <Notice tone="danger">{error}</Notice>}
          {info && <Notice tone="ok">{info}</Notice>}
          <div className="space-y-4">
            <Field label="البريد الإلكتروني" required>
              <input className="field" type="email" dir="ltr" autoComplete="username" inputMode="email"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {mode === "login" && (
              <Field label="كلمة المرور" required>
                <input className="field" type="password" autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
            <Button type="submit" variant="brand" loading={busy} className="w-full">
              {mode === "login" ? "دخول" : "إرسال الرابط"}
            </Button>
          </div>
          <button type="button" className="mt-5 text-sm text-brand underline-offset-4 hover:underline"
            onClick={() => { setMode(mode === "login" ? "forgot" : "login"); setError(null); setInfo(null); }}>
            {mode === "login" ? "نسيت كلمة المرور؟" : "العودة لتسجيل الدخول"}
          </button>
        </form>
      </div>
    </main>
  );
}
