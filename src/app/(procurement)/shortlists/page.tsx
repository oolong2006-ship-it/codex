import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Badge } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function ShortlistsPage() {
  const user = await getCurrentUser();
  const shortlists = await prisma.shortlist.findMany({
    where: { organizationId: user!.organizationId },
    include: {
      owner: { select: { name: true } },
      suppliers: { include: { supplier: { select: { id: true, companyNameEn: true, supplierCode: true, status: true, city: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shortlists</h1>
        <p className="text-sm text-muted-foreground">Curated supplier lists for projects. Add suppliers from any supplier profile.</p>
      </div>

      {shortlists.length === 0 ? (
        <EmptyState title="No shortlists yet" hint="Open a supplier profile and use “Shortlist” to create one." />
      ) : (
        <div className="space-y-4">
          {shortlists.map((sl) => (
            <Card key={sl.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{sl.name}</CardTitle>
                <Badge tone="neutral">{sl.suppliers.length} suppliers</Badge>
              </CardHeader>
              <CardContent>
                {sl.project && <p className="mb-2 text-sm text-muted-foreground">Project: {sl.project}</p>}
                {sl.suppliers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Empty.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {sl.suppliers.map((s) => (
                      <li key={s.supplier.id} className="flex items-center justify-between py-2">
                        <Link href={`/suppliers/${s.supplier.id}`} className="text-sm font-medium hover:text-primary">
                          {s.supplier.companyNameEn} <span className="font-mono text-xs text-muted-foreground">{s.supplier.supplierCode}</span>
                        </Link>
                        <StatusBadge status={s.supplier.status} />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted-foreground">Owner: {sl.owner.name}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
