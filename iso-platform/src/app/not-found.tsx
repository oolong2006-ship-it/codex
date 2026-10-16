import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="mb-2">الصفحة غير موجودة</h1>
      <p className="mb-6 text-sm text-slate-600">قد تكون الصفحة غير موجودة أو لا تملك صلاحية الوصول إليها.</p>
      <Link className="btn-primary" href="/app">العودة إلى لوحة القيادة</Link>
    </main>
  );
}
