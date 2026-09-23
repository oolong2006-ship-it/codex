"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isConfigured } from "@/lib/supabase";
import { Wordmark } from "@/components/Brand";
import { NotConfigured } from "@/components/NotConfigured";
import { Button, Field, Notice, Spinner } from "@/components/ui";

/** يُفتح من رابط البريد (استعادة كلمة المرور أو دعوة مستخدم جديد) */
export default function ResetPasswordPage() {
  const { session, loading, setPassword } = useAuth();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isConfigured) return <NotConfigured />;
  if (loading) return <Spinner />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) { setError("كلمة المرور 8 أحرف على الأقل"); return; }
    if (pw !== pw2) { setError("كلمتا المرور غير متطابقتين"); return; }
    setBusy(true);
    try {
      await setPassword(pw);
      router.replace("/suppliers/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ كلمة المرور");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-brand px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-brand-ink"><Wordmark className="text-[44px]" /></div>
        <form onSubmit={submit} noValidate className="rounded-2xl bg-surface p-6 shadow-xl sm:p-8">
          <h1 className="mb-4 text-lg font-bold">تعيين كلمة مرور جديدة</h1>
          {!session ? (
            <Notice>الرابط منتهي أو غير صالح. اطلب رابطاً جديداً من صفحة الدخول.</Notice>
          ) : (
            <div className="space-y-4">
              {error && <Notice tone="danger">{error}</Notice>}
              <Field label="كلمة المرور الجديدة" required hint="8 أحرف على الأقل">
                <input className="field" type="password" autoComplete="new-password" value={pw}
                  onChange={(e) => setPw(e.target.value)} />
              </Field>
              <Field label="تأكيد كلمة المرور" required>
                <input className="field" type="password" autoComplete="new-password" value={pw2}
                  onChange={(e) => setPw2(e.target.value)} />
              </Field>
              <Button type="submit" variant="brand" loading={busy} className="w-full">حفظ</Button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
