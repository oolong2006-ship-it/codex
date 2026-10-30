import Link from "next/link";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 block text-center text-lg font-bold text-brand-700 no-underline">منصة أيزو الاستشارية</Link>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}
