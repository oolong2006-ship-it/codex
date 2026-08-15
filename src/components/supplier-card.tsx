import Link from "next/link";
import { MapPin, Package, CreditCard, Star } from "lucide-react";
import { Card, CardContent, Badge, Progress } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import type { SupplierCardData } from "@/lib/search";
import { SUPPLIER_STATUS_META } from "@/lib/constants";

export function SupplierCard({ s }: { s: SupplierCardData }) {
  return (
    <Link href={`/suppliers/${s.id}`}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{s.companyNameEn}</div>
              <div className="truncate text-sm text-muted-foreground" dir="rtl">{s.companyNameAr}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{s.supplierCode}</div>
            </div>
            <StatusBadge status={s.status} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.categories.slice(0, 3).map((c) => <Badge key={c} tone="neutral">{c}</Badge>)}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {s.city ?? "—"}</span>
            <span className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> {s.productCount} products</span>
            <span className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /> {s.creditDays != null ? `${s.creditDays}d credit` : "—"}</span>
            <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5" /> {s.rating != null ? s.rating.toFixed(1) : "—"}</span>
          </div>

          {s.brands.length > 0 && (
            <div className="mt-3 truncate text-xs text-muted-foreground">Brands: {s.brands.join(", ")}</div>
          )}

          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Profile</span><span>{s.completeness}%</span>
            </div>
            <Progress value={s.completeness} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
