import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOwnedSupplierId } from "@/lib/supplier-service";
import { aiEnabled } from "@/lib/ai";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { CatalogTool } from "./catalog-tool";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supplierId = await getOwnedSupplierId(user.id, user.organizationId);
  if (!supplierId) redirect("/portal");

  const jobs = await prisma.aiExtractionJob.findMany({
    where: { supplierId, type: "CATALOG_EXTRACTION" },
    include: { extractedProducts: true, catalogUpload: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">AI Catalog Intelligence</h1>
        <Badge tone={aiEnabled() ? "success" : "warning"}>{aiEnabled() ? "Claude enabled" : "Heuristic mode"}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Extract products from a catalog</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload a catalog (PDF / image / Office) or paste its text. AI proposes structured products — nothing is saved to your catalog until you approve it.
          </p>
        </CardHeader>
        <CardContent>
          <CatalogTool
            jobs={jobs.map((j) => ({
              id: j.id,
              status: j.status,
              model: j.model,
              fileName: j.catalogUpload?.fileName ?? null,
              createdAt: j.createdAt.toISOString(),
              products: j.extractedProducts.map((p) => ({
                id: p.id, nameEn: p.nameEn, brand: p.brand, model: p.model,
                description: p.description, confidence: p.confidence, approved: p.approved,
              })),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
