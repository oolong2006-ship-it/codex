"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { activateAccount, verifyActivationToken, type ActivationInfo } from "@/lib/api";
import { activationSchema, type ActivationInput } from "@/lib/validation";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { BrandHeader } from "@/components/Brand";
import { PasswordRules } from "../change-password/page";

function ActivateInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [info, setInfo] = useState<ActivationInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } =
    useForm<ActivationInput>({ resolver: zodResolver(activationSchema) });
  const pw = watch("password") ?? "";

  useEffect(() => {
    if (!token) {
      setTokenError("رابط التفعيل غير مكتمل. تأكد من نسخ الرابط كاملاً.");
      setChecking(false);
      return;
    }
    verifyActivationToken(token)
      .then((res) => {
        setInfo(res);
        if (res.full_name) setValue("full_name", res.full_name);
      })
      .catch((e) => setTokenError(e instanceof Error ? e.message : "رابط التفعيل غير صالح"))
      .finally(() => setChecking(false));
  }, [token, setValue]);

  const onSubmit = async (values: ActivationInput) => {
    setError(null);
    setSubmitting(true);
    try {
      await activateAccount({ token, ...values });
      setDone(true);
      setTimeout(() => router.replace("/login/"), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تفعيل الحساب");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><BrandHeader subtitle="تفعيل حساب مدير النظام" /></div>

        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200 sm:p-8">
          {checking ? (
            <Spinner label="جارٍ التحقق من رابط التفعيل…" />
          ) : tokenError ? (
            <>
              <Alert tone="error" title="رابط غير صالح">{tokenError}</Alert>
              <p className="mt-4 text-xs text-slate-500">
                رابط التفعيل صالح لمدة 24 ساعة ولمرة واحدة فقط. اطلب رابطًا جديدًا
                من مشغّل النظام إذا انتهت صلاحيته.
              </p>
              <Button variant="secondary" full className="mt-4"
                onClick={() => router.push("/login/")}>
                العودة لصفحة الدخول
              </Button>
            </>
          ) : done ? (
            <Alert tone="success" title="تم تفعيل الحساب بنجاح">
              يمكنك الآن تسجيل الدخول برقم جوالك وكلمة المرور التي اخترتها.
              جارٍ تحويلك إلى صفحة الدخول…
            </Alert>
          ) : (
            <>
              <h1 className="mb-1 text-lg font-bold text-brand-800">تفعيل حساب مدير النظام</h1>
              <p className="mb-5 text-sm text-slate-500">
                أكمل بياناتك واختر كلمة مرور قوية. هذا الرابط يُستخدم مرة واحدة فقط.
              </p>

              {info?.phone_masked && (
                <div className="mb-5 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-900 ring-1 ring-brand-100">
                  الرقم المرتبط بالرابط: <span dir="ltr" className="font-bold">{info.phone_masked}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                {error && <Alert tone="error">{error}</Alert>}

                <Field label="الاسم الكامل" required error={errors.full_name?.message}>
                  <Input {...register("full_name")} autoComplete="name"
                    invalid={!!errors.full_name} />
                </Field>

                <Field label="رقم الجوال" required error={errors.phone?.message}
                  hint="يجب أن يطابق الرقم المرتبط برابط التفعيل">
                  <Input {...register("phone")} type="tel" inputMode="tel" dir="ltr"
                    placeholder="05XXXXXXXX" invalid={!!errors.phone} />
                </Field>

                <Field label="كلمة المرور" required error={errors.password?.message}>
                  <Input {...register("password")} type="password"
                    autoComplete="new-password" invalid={!!errors.password} />
                </Field>

                <PasswordRules value={pw} />

                <Field label="تأكيد كلمة المرور" required
                  error={errors.password_confirm?.message}>
                  <Input {...register("password_confirm")} type="password"
                    autoComplete="new-password" invalid={!!errors.password_confirm} />
                </Field>

                <Button type="submit" full loading={submitting}>تفعيل الحساب</Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<Spinner label="جارٍ التحميل…" />}>
      <ActivateInner />
    </Suspense>
  );
}
