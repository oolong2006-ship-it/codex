"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string };

export function DashNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Dashboard">
      {items.map((i) => {
        const active = i.href === "/dashboard" ? path === i.href : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
              active ? "bg-espresso-800 text-cream-50" : "text-espresso-700 hover:bg-cream-200"
            }`}
          >
            <span aria-hidden className="text-base">{i.icon}</span>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
