"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth-context";
import { changePasswordSchema, checkPassword, type ChangePasswordInput } from "@/lib/validation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { BrandHeader } from "@/components/Brand";

export function PasswordRules({ value, phone }: { value: string; phone?: string | null }) {
  const { problems } = checkPassword(value, phone);
  const rules = [
    "12 حرفًا على الأقل",
    "حرف إنجليزي صغير",
    "حرف إنجليزي كبير",
    "رقم واحد على الأقل",
    "رمز خاص مثل !@#$",
  ];
  const checks = [
    value.length >= 12,
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /[0-9]/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ];
  return (
    <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
      {rules.map((r, i) => (
        <li key={r} className={checks[i] ? "text-brand-600" : "text-slate-400"}>
          {checks[i] ? "✓" : "○"} {r}
        </li>
      ))}
      {problems.filter((p) => !p.startsWith("يجب")).map((p) => (
        <li key={p} className="text-rose-600 sm:col-span-2">✕ {p}</li>
      ))}
    </ul>
  );
}

export default function ChangePasswordPage() {
  const { profile, session, loading, changePassword, signOut } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } =
    useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });
  const pw = watch("password") ?? "";

  useEffect(() => {
    if (!loading && !session) router.replace("/login/");
  }, [session, loading, router]);

  const onSubmit = async (values: ChangePasswordInput) => {
    setError(null);
    setSubmitting(true);
    try {
      await changePassword(values.password);
      setDone(true);
      setTimeout(() => router.replace("/dashboard/"), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تغيير كلمة المرور");
    } finally {
      setSubmitting(false);
    }
  };

  const forced = profile?.must_change_password;

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><BrandHeader /></div>

        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200 sm:p-8">
          <h1 className="mb-1 text-lg font-bold text-brand-800">تغيير كلمة المرور</h1>
          <p className="mb-6 text-sm text-slate-500">
            {forced
              ? "يجب تغيير كلمة المرور المؤقتة قبل استخدام النظام."
              : "اختر كلمة مرور قوية جديدة لحسابك."}
          </p>

          {done ? (
            <Alert tone="success" title="تم بنجاح">
              تم تغيير كلمة المرور. جارٍ تحويلك إلى لوحة المتابعة…
            </Alert>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {error && <Alert tone="error">{error}</Alert>}

              <Field label="كلمة المرور الجديدة" required error={errors.password?.message}>
                <Input {...register("password")} type="password"
                  autoComplete="new-password" invalid={!!errors.password} />
              </Field>

              <PasswordRules value={pw} phone={profile?.phone} />

              <Field label="تأكيد كلمة المرور" required
                error={errors.password_confirm?.message}>
                <Input {...register("password_confirm")} type="password"
                  autoComplete="new-password" invalid={!!errors.password_confirm} />
              </Field>

              <Button type="submit" full loading={submitting}>حفظ كلمة المرور</Button>

              {!forced && (
                <Button type="button" variant="ghost" full
                  onClick={() => router.push("/dashboard/")}>
                  إلغاء
                </Button>
              )}
              {forced && (
                <Button type="button" variant="ghost" full onClick={() => signOut()}>
                  تسجيل الخروج
                </Button>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
