"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { SUPPLIER_TYPES, SAUDI_CITIES, SAUDI_REGIONS, SUPPLIER_STATUS_META } from "@/lib/constants";
import type { SupplierStatus } from "@prisma/client";

export function SearchFilters({ categories }: { categories: { id: string; nameEn: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  function update(patch: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => { e.preventDefault(); update({ q }); }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suppliers, products, brands, categories, services…" className="ps-9" />
        </div>
        <Button type="submit"><Search className="h-4 w-4" /> Search</Button>
      </form>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Filter label="Category" value={sp.get("categoryId") ?? ""} onChange={(v) => update({ categoryId: v })} options={categories.map((c) => ({ value: c.id, label: c.nameEn }))} />
        <Filter label="City" value={sp.get("city") ?? ""} onChange={(v) => update({ city: v })} options={SAUDI_CITIES.map((c) => ({ value: c, label: c }))} />
        <Filter label="Region" value={sp.get("region") ?? ""} onChange={(v) => update({ region: v })} options={SAUDI_REGIONS.map((r) => ({ value: r, label: r }))} />
        <Filter label="Supplier type" value={sp.get("supplierType") ?? ""} onChange={(v) => update({ supplierType: v })} options={SUPPLIER_TYPES.map((t) => ({ value: t.value, label: t.en }))} />
        <Filter label="Status" value={sp.get("status") ?? ""} onChange={(v) => update({ status: v })} options={Object.entries(SUPPLIER_STATUS_META).map(([k, m]) => ({ value: k, label: m.en }))} />
        <Filter label="Min. profile score" value={sp.get("minScore") ?? ""} onChange={(v) => update({ minScore: v })} options={[["50", "50%+"], ["70", "70%+"], ["90", "90%+"]].map(([v, l]) => ({ value: v, label: l }))} />
        <Filter label="Max. credit days" value={sp.get("maxCreditDays") ?? ""} onChange={(v) => update({ maxCreditDays: v })} options={[["30", "≤ 30"], ["60", "≤ 60"], ["90", "≤ 90"]].map(([v, l]) => ({ value: v, label: l }))} />
        <Filter label="Delivery" value={sp.get("deliveryCapability") ?? ""} onChange={(v) => update({ deliveryCapability: v })} options={[{ value: "1", label: "Has delivery" }]} />
      </div>
    </div>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}: All</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}
