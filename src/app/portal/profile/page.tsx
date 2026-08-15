import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getOwnedSupplier } from "@/lib/supplier-service";
import { ProfileSections } from "./profile-sections";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supplier = await getOwnedSupplier(user.id, user.organizationId);
  if (!supplier) redirect("/portal");

  const [categories, services, brands, locations, terms] = await Promise.all([
    prisma.category.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ level: "asc" }, { nameEn: "asc" }],
      select: { id: true, nameEn: true, nameAr: true, level: true, parentId: true },
    }),
    prisma.service.findMany({ where: { supplierId: supplier.id } }),
    prisma.supplierBrand.findMany({ where: { supplierId: supplier.id }, include: { brand: true } }),
    prisma.supplierLocation.findMany({ where: { supplierId: supplier.id } }),
    prisma.supplierCommercialTerms.findUnique({ where: { supplierId: supplier.id } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Company</h1>
      <ProfileSections
        supplier={{
          companyNameEn: supplier.companyNameEn,
          companyNameAr: supplier.companyNameAr,
          crNumber: supplier.crNumber,
          vatNumber: supplier.vatNumber,
          iban: supplier.iban,
          companyType: supplier.companyType,
          yearEstablished: supplier.yearEstablished,
          country: supplier.country,
          city: supplier.city,
          headquarters: supplier.headquarters,
          website: supplier.website,
          employeeCount: supplier.employeeCount,
          annualRevenue: supplier.annualRevenue,
          primaryPhone: supplier.primaryPhone,
          supplierTypes: supplier.supplierTypes,
        }}
        contacts={supplier.contacts}
        products={supplier.products.map((p) => ({ id: p.id, nameEn: p.nameEn, brand: p.brand, sku: p.sku, source: p.source }))}
        selectedCategoryIds={supplier.categories.map((c) => c.categoryId)}
        categories={categories}
        services={services}
        brands={brands.map((b) => ({ id: b.brandId, name: b.brand.name, country: b.brand.country, relationship: b.relationship }))}
        locations={locations}
        terms={terms}
      />
    </div>
  );
}
