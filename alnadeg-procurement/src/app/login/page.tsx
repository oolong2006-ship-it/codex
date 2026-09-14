"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth-context";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { Alert, Button, Field, Input } from "@/components/ui";
import { BrandHeader } from "@/components/Brand";

export default function LoginPage() {
  const { signIn, session, profile, loading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: "", password: "" },
  });

  // من سجّل دخوله بالفعل يُحوَّل مباشرة
  useEffect(() => {
    if (loading || !session || !profile) return;
    router.replace(profile.must_change_password ? "/change-password/" : "/dashboard/");
  }, [session, profile, loading, router]);

  const onSubmit = async (values: LoginInput) => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(values.phone, values.password);
      // التحويل يتم في useEffect بعد تحميل الملف الشخصي
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تسجيل الدخول");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-gradient-to-bl
                               from-brand-800 via-brand-700 to-brand-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex flex-col items-center gap-3">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl
                             bg-white/10 text-3xl font-extrabold text-gold-300 ring-1 ring-white/20">
              ن
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-white">بوابة مشتريات الناضج</h1>
              <p className="mt-1 text-sm text-brand-100">
                فروع ومواقع شركة مطاعم الناضج
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <h2 className="mb-1 text-lg font-bold text-brand-800">تسجيل الدخول</h2>
          <p className="mb-6 text-sm text-slate-500">
            أدخل رقم جوالك وكلمة المرور للمتابعة
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {error && <Alert tone="error">{error}</Alert>}

            <Field label="رقم الجوال" required error={errors.phone?.message}
              hint="مثال: 0551234567">
              <Input {...register("phone")} type="tel" inputMode="tel"
                autoComplete="username" placeholder="05XXXXXXXX"
                invalid={!!errors.phone} dir="ltr" />
            </Field>

            <Field label="كلمة المرور" required error={errors.password?.message}>
              <Input {...register("password")} type="password"
                autoComplete="current-password" placeholder="••••••••••••"
                invalid={!!errors.password} />
            </Field>

            <Button type="submit" full loading={submitting}>
              تسجيل الدخول
            </Button>
          </form>

          <p className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
            للحصول على حساب أو استعادة كلمة المرور، يرجى مراجعة مدير النظام.
          </p>
        </div>
      </div>
    </main>
  );
}
