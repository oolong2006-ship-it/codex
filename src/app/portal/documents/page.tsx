import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOwnedSupplierId } from "@/lib/supplier-service";
import { requiredDocumentsForSupplier } from "@/lib/rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { DocumentsManager } from "./documents-manager";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supplierId = await getOwnedSupplierId(user.id, user.organizationId);
  if (!supplierId) redirect("/portal");

  const [documents, docTypes, required] = await Promise.all([
    prisma.document.findMany({
      where: { supplierId },
      include: { documentType: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.documentType.findMany({ where: { organizationId: user.organizationId }, orderBy: { nameEn: "asc" } }),
    requiredDocumentsForSupplier(user.organizationId, supplierId),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Documents</h1>
      <Card>
        <CardHeader><CardTitle>Required documents</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {required.map((r) => (
              <span key={r.code} className={`rounded-full px-3 py-1 text-xs ring-1 ring-inset ${r.provided ? "bg-[hsl(var(--success))]/12 text-[hsl(var(--success))] ring-[hsl(var(--success))]/25" : r.mandatory ? "bg-[hsl(var(--danger))]/12 text-[hsl(var(--danger))] ring-[hsl(var(--danger))]/25" : "bg-muted text-muted-foreground ring-border"}`}>
                {r.nameEn}{r.mandatory ? " *" : ""}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
      <DocumentsManager
        documents={documents.map((d) => ({
          id: d.id,
          typeName: d.documentType.nameEn,
          fileName: d.fileName,
          status: d.status,
          documentNumber: d.documentNumber,
          issueDate: d.issueDate?.toISOString() ?? null,
          expiryDate: d.expiryDate?.toISOString() ?? null,
        }))}
        docTypes={docTypes.map((t) => ({ id: t.id, name: t.nameEn, hasExpiry: t.hasExpiry }))}
      />
    </div>
  );
}
