"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LogOut, Menu, X, LayoutDashboard, Building2, FileText, Sparkles,
  Users, Search, PieChart, ListChecks, Activity,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useLang } from "@/lib/i18n/context";
import { LangToggle } from "@/components/lang-toggle";
import type { DictKey } from "@/lib/i18n/dictionaries";

interface NavItem {
  href: string;
  labelKey: DictKey;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Nav definitions live inside this client component. React component functions
 * (Lucide icons) cannot be passed as props across the server→client boundary,
 * so server layouts only pass a `variant` string.
 */
const NAV: Record<"procurement" | "portal", NavItem[]> = {
  procurement: [
    { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
    { href: "/search", labelKey: "nav.search", icon: Search },
    { href: "/suppliers", labelKey: "nav.suppliers", icon: Users },
    { href: "/coverage", labelKey: "nav.coverage", icon: PieChart },
    { href: "/shortlists", labelKey: "nav.shortlists", icon: ListChecks },
    { href: "/activity", labelKey: "nav.activity", icon: Activity },
  ],
  portal: [
    { href: "/portal", labelKey: "supplier.overview", icon: LayoutDashboard },
    { href: "/portal/profile", labelKey: "nav.myProfile", icon: Building2 },
    { href: "/portal/documents", labelKey: "nav.documents", icon: FileText },
    { href: "/portal/catalog", labelKey: "supplier.products", icon: Sparkles },
  ],
};

export function AppShell({
  variant,
  user,
  children,
}: {
  variant: "procurement" | "portal";
  user: { name: string; role: string; org: string };
  children: React.ReactNode;
}) {
  const nav = NAV[variant];
  const pathname = usePathname();
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  const roleLabel = user.role.replace(/_/g, " ").toLowerCase();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 z-40 w-64 shrink-0 border-e border-border bg-card transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-border px-5 font-semibold">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">SI</div>
          <span className="truncate">{t("app.name")}</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 backdrop-blur lg:px-6">
          <button className="lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="hidden text-sm text-muted-foreground lg:block">{user.org}</div>
          <div className="flex items-center gap-3">
            <LangToggle />
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {initials(user.name)}
              </div>
              <div className="hidden text-sm sm:block">
                <div className="font-medium leading-tight">{user.name}</div>
                <div className="text-xs capitalize text-muted-foreground">{roleLabel}</div>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("nav.signOut")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
