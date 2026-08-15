import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { searchSuppliers } from "@/lib/search";
import { SupplierCard } from "@/components/supplier-card";
import { EmptyState, Button } from "@/components/ui";
import { SearchFilters } from "./search-filters";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await getCurrentUser();
  const orgId = user!.organizationId;

  const categories = await prisma.category.findMany({
    where: { organizationId: orgId, level: { lte: 1 } },
    orderBy: [{ level: "asc" }, { nameEn: "asc" }],
    select: { id: true, nameEn: true },
  });

  const page = Number(searchParams.page ?? "1") || 1;
  const { total, pages, results } = await searchSuppliers(orgId, {
    q: searchParams.q,
    categoryId: searchParams.categoryId,
    city: searchParams.city,
    region: searchParams.region,
    supplierType: searchParams.supplierType,
    status: searchParams.status,
    minScore: searchParams.minScore ? Number(searchParams.minScore) : undefined,
    maxCreditDays: searchParams.maxCreditDays ? Number(searchParams.maxCreditDays) : undefined,
    brand: searchParams.brand,
    deliveryCapability: searchParams.deliveryCapability === "1",
    page,
  });

  const qs = (p: number) => {
    const params = new URLSearchParams(searchParams as Record<string, string>);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Supplier Search</h1>
        <p className="text-sm text-muted-foreground">Discover qualified suppliers across your organization.</p>
      </div>

      <SearchFilters categories={categories} />

      <p className="text-sm text-muted-foreground">{total} {total === 1 ? "result" : "results"}</p>

      {results.length === 0 ? (
        <EmptyState title="No suppliers match your filters" hint="Try broadening the search terms or clearing filters." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((s) => <SupplierCard key={s.id} s={s} />)}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && <Link href={qs(page - 1)}><Button variant="outline" size="sm">Previous</Button></Link>}
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          {page < pages && <Link href={qs(page + 1)}><Button variant="outline" size="sm">Next</Button></Link>}
        </div>
      )}
    </div>
  );
}
