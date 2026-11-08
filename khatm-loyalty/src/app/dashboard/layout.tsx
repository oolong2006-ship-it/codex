import Link from "next/link";
import { requireDashboardActor, getLang } from "@/server/web";
import { getMerchant } from "@/server/domain/management";
import { can, PERMISSIONS, type Permission } from "@/server/rbac";
import { t } from "@/lib/i18n";
import { Logo } from "@/components/logo";
import { LangToggle } from "@/components/lang-toggle";
import { DashNav, type NavItem } from "./nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireDashboardActor();
  const lang = await getLang();
  const merchant = await getMerchant(actor);
  const all: Array<NavItem & { perm: Permission }> = [
    { href: "/dashboard", label: t(lang, "nav.overview"), icon: "◔", perm: PERMISSIONS.DASHBOARD_VIEW },
    { href: "/dashboard/customers", label: t(lang, "nav.customers"), icon: "☺", perm: PERMISSIONS.CUSTOMER_VIEW },
    { href: "/dashboard/program", label: t(lang, "nav.program"), icon: "✦", perm: PERMISSIONS.PROGRAM_MANAGE },
    { href: "/dashboard/poster", label: t(lang, "nav.poster"), icon: "▦", perm: PERMISSIONS.DASHBOARD_VIEW },
    { href: "/dashboard/campaigns", label: t(lang, "nav.campaigns"), icon: "✉", perm: PERMISSIONS.CAMPAIGN_SEND },
    { href: "/dashboard/branches", label: t(lang, "nav.branches"), icon: "⌂", perm: PERMISSIONS.BRANCH_MANAGE },
    { href: "/dashboard/staff", label: t(lang, "nav.staff"), icon: "☷", perm: PERMISSIONS.STAFF_MANAGE },
    { href: "/dashboard/integrations", label: t(lang, "nav.integrations"), icon: "⇄", perm: PERMISSIONS.INTEGRATION_MANAGE },
    { href: "/dashboard/activity", label: t(lang, "nav.activity"), icon: "≡", perm: PERMISSIONS.STAFF_MANAGE },
  ];
  const items = all.filter((i) => can(actor.role, i.perm)).map(({ perm: _perm, ...i }) => i);
  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col lg:flex-row">
      <aside className="no-print border-cream-300 bg-cream-50/60 px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:shrink-0 lg:border-e lg:py-6">
        <div className="flex items-center justify-between lg:block">
          <Link href="/dashboard"><Logo label={t(lang, "brand.name")} /></Link>
          <div className="flex items-center lg:hidden">
            <LangToggle lang={lang} />
            <form action="/logout" method="post">
              <button className="rounded-lg px-2.5 py-1.5 text-sm text-espresso-500 hover:bg-cream-200">{t(lang, "common.logout")}</button>
            </form>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-cream-200/70 px-3 py-2.5 lg:mt-6">
          <div className="truncate text-sm font-semibold" data-testid="merchant-name">{merchant.name}</div>
          <div className="truncate text-xs text-espresso-500">{actor.name} · {t(lang, `role.${actor.role}`)}</div>
        </div>
        <div className="mt-4">
          <DashNav items={items} />
        </div>
        <div className="mt-4 hidden flex-col gap-2 lg:flex">
          <Link href="/pos" className="btn-accent w-full">{t(lang, "nav.openStaff")}</Link>
          <div className="flex items-center justify-between">
            <LangToggle lang={lang} />
            <form action="/logout" method="post">
              <button className="rounded-lg px-2.5 py-1.5 text-sm text-espresso-500 hover:bg-cream-200">{t(lang, "common.logout")}</button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
