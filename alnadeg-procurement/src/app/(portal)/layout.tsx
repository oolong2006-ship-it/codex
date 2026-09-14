"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ROLE_LABEL } from "@/lib/labels";
import { REQUESTER_ROLES, STAGE_ROLE } from "@/lib/constants";
import { Button, Spinner, cn } from "@/components/ui";
import { Logo } from "@/components/Brand";

interface NavItem { href: string; label: string; show: boolean }

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, signOut, isSuperAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) { router.replace("/login/"); return; }
    if (profile?.must_change_password) router.replace("/change-password/");
  }, [session, profile, loading, router]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (loading || !session || !profile) return <Spinner label="جارٍ تحميل البوابة…" />;

  // صندوق الاعتمادات يظهر فقط لمن له مرحلة في المسار
  const isApprover = Object.values(STAGE_ROLE).includes(profile.role) || isSuperAdmin;

  const nav: NavItem[] = [
    { href: "/dashboard/", label: "لوحة المتابعة", show: true },
    { href: "/requests/", label: "الطلبات", show: true },
    { href: "/requests/new/", label: "طلب شراء جديد", show: REQUESTER_ROLES.includes(profile.role) },
    { href: "/approvals/", label: "صندوق الاعتمادات", show: isApprover },
    { href: "/reports/", label: "التقارير", show: true },
    { href: "/admin/users/", label: "إدارة المستخدمين", show: isSuperAdmin },
    { href: "/admin/locations/", label: "إدارة المواقع", show: isSuperAdmin },
    { href: "/admin/audit/", label: "سجل التدقيق", show: isSuperAdmin },
    { href: "/profile/", label: "الملف الشخصي", show: true },
  ].filter((n) => n.show);

  const NavLinks = ({ mobile }: { mobile?: boolean }) => (
    <nav className={cn("flex gap-1", mobile ? "flex-col" : "flex-col")}>
      {nav.map((item) => {
        const active = pathname === item.href.replace(/\/$/, "") ||
          pathname === item.href || pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href}
            className={cn(
              "rounded-lg px-3 py-2.5 text-sm font-medium transition",
              active
                ? "bg-brand-700 text-white"
                : "text-brand-50 hover:bg-brand-700/50",
            )}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* الشريط الجانبي — سطح المكتب */}
      <aside className="hidden w-64 shrink-0 bg-brand-800 p-4 lg:flex lg:flex-col">
        <div className="mb-6 flex items-center gap-2.5 px-1">
          <Logo size="sm" />
          <div>
            <p className="text-sm font-extrabold text-white">بوابة المشتريات</p>
            <p className="text-[11px] text-brand-200">مطاعم الناضج</p>
          </div>
        </div>
        <NavLinks />
        <div className="mt-auto border-t border-brand-700 pt-4">
          <p className="px-3 text-sm font-semibold text-white">{profile.full_name}</p>
          <p className="px-3 text-xs text-brand-200">{ROLE_LABEL[profile.role]}</p>
          <button onClick={signOut}
            className="mt-3 w-full rounded-lg px-3 py-2 text-right text-sm text-brand-100
                       hover:bg-brand-700">
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* الشريط العلوي — الجوال */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-brand-800
                         px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <Logo size="sm" />
          <p className="text-sm font-extrabold text-white">بوابة المشتريات</p>
        </div>
        <button onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen} aria-label="القائمة"
          className="rounded-lg p-2 text-white hover:bg-brand-700">
          <span className="block h-0.5 w-6 bg-current" />
          <span className="mt-1.5 block h-0.5 w-6 bg-current" />
          <span className="mt-1.5 block h-0.5 w-6 bg-current" />
        </button>
      </header>

      {menuOpen && (
        <div className="sticky top-[52px] z-20 bg-brand-800 px-4 pb-4 lg:hidden">
          <NavLinks mobile />
          <div className="mt-3 border-t border-brand-700 pt-3">
            <p className="text-sm font-semibold text-white">{profile.full_name}</p>
            <p className="text-xs text-brand-200">{ROLE_LABEL[profile.role]}</p>
            <Button variant="secondary" full className="mt-2" onClick={signOut}>
              تسجيل الخروج
            </Button>
          </div>
        </div>
      )}

      <main id="main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
