"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";
import { SUPPLIER_STATUS_META } from "@/lib/constants";

export function StatusFilter({ current }: { current: string }) {
  const router = useRouter();
  return (
    <Select
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v ? `/suppliers?status=${v}` : "/suppliers");
      }}
      className="w-56"
    >
      <option value="">All statuses</option>
      {Object.entries(SUPPLIER_STATUS_META).map(([k, m]) => (
        <option key={k} value={k}>{m.en}</option>
      ))}
    </Select>
  );
}
