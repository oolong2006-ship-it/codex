import { Wordmark } from "./Brand";

export function NotConfigured() {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16">
      <Wordmark className="text-5xl text-brand" />
      <h1 className="mt-6 text-xl font-bold">الاتصال بقاعدة البيانات غير مضبوط</h1>
      <p className="mt-2 text-muted">
        اضبط المتغيرين <code dir="ltr">NEXT_PUBLIC_SUPABASE_URL</code> و
        <code dir="ltr"> NEXT_PUBLIC_SUPABASE_ANON_KEY</code> في ملف <code dir="ltr">.env.local</code>
        (أو في أسرار النشر) ثم أعد البناء. التفاصيل في README.
      </p>
    </main>
  );
}
