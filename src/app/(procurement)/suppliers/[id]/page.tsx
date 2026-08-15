import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { can, PERMISSIONS } from "@/lib/rbac";
import { requiredDocumentsForSupplier } from "@/lib/rules";
import { computeDocumentStatus } from "@/lib/documents";
import { SupplierProfile } from "./supplier-profile";
import { DOCUMENT_TYPES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function SupplierProfilePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, organizationId: user!.organizationId },
    include: {
      contacts: true,
      categories: { include: { category: true } },
      products: { include: { category: true }, orderBy: { createdAt: "desc" } },
      services: true,
      brands: { include: { brand: true } },
      locations: true,
      documents: { include: { documentType: true }, orderBy: { createdAt: "desc" } },
      certifications: true,
      commercialTerms: true,
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      evaluations: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      statusHistory: { include: { changedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      owner: { select: { email: true } },
    },
  });
  if (!supplier) notFound();

  const [activity, shortlists, requiredDocs] = await Promise.all([
    prisma.activityLog.findMany({
      where: { organizationId: user!.organizationId, supplierId: supplier.id },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.shortlist.findMany({ where: { organizationId: user!.organizationId }, select: { id: true, name: true } }),
    requiredDocumentsForSupplier(user!.organizationId, supplier.id),
  ]);

  const perms = {
    approve: can(user!.role, PERMISSIONS.APPROVE_SUPPLIERS),
    reject: can(user!.role, PERMISSIONS.REJECT_SUPPLIERS),
    suspend: can(user!.role, PERMISSIONS.SUSPEND_SUPPLIERS),
    requestInfo: can(user!.role, PERMISSIONS.REQUEST_INFO),
    notes: can(user!.role, PERMISSIONS.ADD_NOTES),
    evaluate: can(user!.role, PERMISSIONS.EVALUATE_SUPPLIERS),
    shortlist: can(user!.role, PERMISSIONS.MANAGE_SHORTLISTS),
  };

  return (
    <SupplierProfile
      perms={perms}
      shortlists={shortlists}
      docTypes={DOCUMENT_TYPES.map((d) => d.code)}
      requiredDocs={requiredDocs}
      supplier={{
        id: supplier.id,
        supplierCode: supplier.supplierCode,
        companyNameEn: supplier.companyNameEn,
        companyNameAr: supplier.companyNameAr,
        status: supplier.status,
        completeness: supplier.completeness,
        rating: supplier.rating,
        crNumber: supplier.crNumber,
        vatNumber: supplier.vatNumber,
        iban: supplier.iban,
        city: supplier.city,
        country: supplier.country,
        website: supplier.website,
        companyType: supplier.companyType,
        yearEstablished: supplier.yearEstablished,
        employeeCount: supplier.employeeCount,
        primaryPhone: supplier.primaryPhone,
        ownerEmail: supplier.owner?.email ?? null,
        supplierTypes: supplier.supplierTypes,
        contacts: supplier.contacts,
        categories: supplier.categories.map((c) => c.category.nameEn),
        products: supplier.products.map((p) => ({ id: p.id, nameEn: p.nameEn, brand: p.brand, sku: p.sku, category: p.category?.nameEn ?? null, source: p.source })),
        services: supplier.services,
        brands: supplier.brands.map((b) => ({ name: b.brand.name, country: b.brand.country, relationship: b.relationship })),
        locations: supplier.locations,
        documents: supplier.documents.map((d) => ({
          id: d.id, typeName: d.documentType.nameEn, fileName: d.fileName,
          status: computeDocumentStatus(d.status, d.expiryDate), rawStatus: d.status,
          expiryDate: d.expiryDate?.toISOString() ?? null, documentNumber: d.documentNumber,
        })),
        certifications: supplier.certifications,
        commercialTerms: supplier.commercialTerms,
        notes: supplier.notes.map((n) => ({ id: n.id, body: n.body, author: n.author.name, createdAt: n.createdAt.toISOString() })),
        evaluations: supplier.evaluations.map((e) => ({ id: e.id, score: e.score, outcome: e.outcome, comment: e.comment, author: e.author.name, createdAt: e.createdAt.toISOString() })),
        statusHistory: supplier.statusHistory.map((h) => ({ from: h.fromStatus, to: h.toStatus, reason: h.reason, by: h.changedBy?.name ?? "system", createdAt: h.createdAt.toISOString() })),
        activity: activity.map((a) => ({ action: a.action, detail: a.detail, actor: a.actor?.name ?? "system", createdAt: a.createdAt.toISOString() })),
      }}
    />
  );
}
