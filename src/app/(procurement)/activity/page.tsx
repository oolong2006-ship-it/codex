import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await getCurrentUser();
  const logs = await prisma.activityLog.findMany({
    where: { organizationId: user!.organizationId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Resolve supplier codes for linking.
  const supplierIds = [...new Set(logs.map((l) => l.supplierId).filter(Boolean))] as string[];
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: supplierIds } },
    select: { id: true, supplierCode: true, companyNameEn: true },
  });
  const supMap = new Map(suppliers.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Activity Log</h1>
      {logs.length === 0 ? (
        <EmptyState title="No activity recorded yet" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {logs.map((l) => {
                const sup = l.supplierId ? supMap.get(l.supplierId) : null;
                return (
                  <li key={l.id} className="flex items-start gap-3 p-4">
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{l.action.replace(/_/g, " ")}</div>
                      {l.detail && <div className="text-xs text-muted-foreground">{l.detail}</div>}
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {l.actor?.name ?? "system"}
                        {sup && <> · <Link href={`/suppliers/${sup.id}`} className="hover:text-primary">{sup.companyNameEn} ({sup.supplierCode})</Link></>}
                        {" · "}{new Date(l.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
