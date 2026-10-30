import Link from "next/link";
import { getOrganization } from "@/server/domain/orgs";
import { requireCtx } from "@/server/web";
import { can } from "@/server/rbac";

const ROLE_AR = { OWNER: "مالك", QUALITY_MANAGER: "مدير الجودة", CONTRIBUTOR: "مساهم", AUDITOR: "مدقق", VIEWER: "مشاهد" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, ctx } = await requireCtx();
  const org = await getOrganization(ctx);
  const nav = [
    { href: "/app", label: "لوحة القيادة" },
    { href: "/app/projects", label: "مشاريع أنظمة الإدارة" },
    { href: "/app/documents", label: "الوثائق المضبوطة" },
    { href: "/app/capa", label: "عدم المطابقة والتصحيح" },
    { href: "/app/org", label: "المنشأة والمواقع" },
    { href: "/app/members", label: "الفريق والصلاحيات" },
    ...(can(ctx.role, "audit_log.read") ? [{ href: "/app/audit", label: "سجل الأحداث" }] : []),
    { href: "/app/standards", label: "المواصفات والترخيص" },
  ];
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-brand-900 text-brand-50 md:min-h-screen md:w-64 md:border-b-0">
        <div className="px-4 py-4">
          <Link href="/app" className="block text-base font-bold text-white no-underline">منصة أيزو الاستشارية</Link>
          <p className="mt-2 truncate text-sm text-brand-100">{org.name}</p>
          <p className="text-xs text-brand-100/70">{session.fullName} — {ROLE_AR[ctx.role]}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-brand-50 no-underline hover:bg-white/10">
              {n.label}
            </Link>
          ))}
          <Link href="/onboarding" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-brand-100/80 no-underline hover:bg-white/10">تبديل المنشأة</Link>
          <form action="/logout" method="post">
            <button className="w-full whitespace-nowrap rounded-lg px-3 py-2 text-start text-sm text-brand-100/80 hover:bg-white/10">تسجيل الخروج</button>
          </form>
        </nav>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
