"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isConfigured } from "@/lib/supabase";
import { CompareProvider } from "@/lib/compare-context";
import { ROLE_LABEL } from "@/lib/constants";
import { Wordmark } from "@/components/Brand";
import { NotConfigured } from "@/components/NotConfigured";
import { Spinner, cn } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, signOut, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isConfigured || loading) return;
    if (!session) router.replace("/login/");
  }, [session, loading, router]);

  if (!isConfigured) return <NotConfigured />;
  if (loading || !session) return <Spinner />;
  if (!profile) return <Spinner label="جارٍ تحميل الحساب…" />;
  if (!profile.is_active) {
    return (
      <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-semibold">الحساب غير مفعّل</p>
        <p className="mt-2 text-muted">الحسابات الجديدة تحتاج تفعيلاً من مدير النظام. تواصل معه ثم أعد المحاولة.</p>
        <button className="mt-6 underline" onClick={signOut}>تسجيل الخروج</button>
      </main>
    );
  }

  const nav = [
    { href: "/suppliers/", label: "الموردون", show: true },
    { href: "/import/", label: "الاستيراد", show: profile.role !== "viewer" },
    { href: "/admin/users/", label: "المستخدمون", show: isAdmin },
  ].filter((n) => n.show);

  return (
    <CompareProvider>
      <header className="bg-brand text-brand-ink">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-2 pt-[calc(12px+env(safe-area-inset-top,0px))]">
          <Link href="/suppliers/" className="flex items-baseline gap-3" aria-label="مَورِد — الرئيسية">
            <Wordmark className="text-[32px]" />
            <span className="hidden text-sm opacity-85 sm:inline">دليل موردي الهوريكا</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-90">{profile.full_name || profile.email}
              <span className="mr-1.5 rounded-md bg-white/15 px-1.5 py-0.5 text-xs">{ROLE_LABEL[profile.role]}</span>
            </span>
            <button onClick={signOut} className="underline-offset-4 opacity-90 hover:underline">خروج</button>
          </div>
          <nav className="flex w-full gap-1 overflow-x-auto" aria-label="القائمة">
            {nav.map((n) => (
              <Link key={n.href} href={n.href}
                aria-current={pathname.startsWith(n.href.slice(0, -1)) ? "page" : undefined}
                className={cn("whitespace-nowrap rounded-t-lg px-3 py-1.5 text-sm",
                  pathname.startsWith(n.href.slice(0, -1)) ? "bg-bg font-semibold text-ink" : "opacity-85 hover:opacity-100")}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1180px] px-4 pb-32 pt-4">{children}</main>
    </CompareProvider>
  );
}
