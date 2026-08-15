import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { searchSuppliers } from "@/lib/search";
import { Card, CardContent, Select, Progress, EmptyState, Button } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { SUPPLIER_STATUS_META } from "@/lib/constants";
import { StatusFilter } from "./status-filter";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await getCurrentUser();
  const page = Number(searchParams.page ?? "1") || 1;
  const { total, pages, results } = await searchSuppliers(user!.organizationId, {
    status: searchParams.status,
    q: searchParams.q,
    page,
    pageSize: 20,
  });

  const qs = (p: number) => {
    const params = new URLSearchParams(searchParams as Record<string, string>);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-muted-foreground">{total} suppliers</p>
        </div>
        <StatusFilter current={searchParams.status ?? ""} />
      </div>

      {results.length === 0 ? (
        <EmptyState title="No suppliers found" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="p-3 text-start font-medium">Supplier</th>
                    <th className="p-3 text-start font-medium">Code</th>
                    <th className="p-3 text-start font-medium">City</th>
                    <th className="p-3 text-start font-medium">Products</th>
                    <th className="p-3 text-start font-medium">Profile</th>
                    <th className="p-3 text-start font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="p-3">
                        <Link href={`/suppliers/${s.id}`} className="font-medium hover:text-primary">{s.companyNameEn}</Link>
                        <div className="text-xs text-muted-foreground">{s.categories.slice(0, 2).join(", ")}</div>
                      </td>
                      <td className="p-3 font-mono text-xs">{s.supplierCode}</td>
                      <td className="p-3">{s.city ?? "—"}</td>
                      <td className="p-3">{s.productCount}</td>
                      <td className="p-3"><div className="w-24"><Progress value={s.completeness} /></div></td>
                      <td className="p-3"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
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
