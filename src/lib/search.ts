import { prisma } from "@/lib/prisma";
import type { Prisma, SupplierStatus, SupplierTypeEnum } from "@prisma/client";

export interface SearchParams {
  q?: string;
  categoryId?: string;
  city?: string;
  region?: string;
  supplierType?: string;
  status?: string;
  minScore?: number;
  maxCreditDays?: number;
  brand?: string;
  deliveryCapability?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SupplierCardData {
  id: string;
  supplierCode: string;
  companyNameEn: string;
  companyNameAr: string;
  city: string | null;
  status: SupplierStatus;
  completeness: number;
  rating: number | null;
  supplierTypes: SupplierTypeEnum[];
  productCount: number;
  categories: string[];
  brands: string[];
  creditDays: number | null;
}

/**
 * Tenant-scoped supplier search. Free-text matches company name, products,
 * brands, services and categories; structured filters narrow the result.
 */
export async function searchSuppliers(organizationId: string, params: SearchParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, params.pageSize ?? 12);

  const and: Prisma.SupplierWhereInput[] = [{ organizationId }];

  if (params.q?.trim()) {
    const q = params.q.trim();
    const like: Prisma.StringFilter = { contains: q, mode: "insensitive" };
    and.push({
      OR: [
        { companyNameEn: like },
        { companyNameAr: { contains: q } },
        { aiKeywords: { has: q } },
        { products: { some: { OR: [{ nameEn: like }, { brand: like }, { model: like }] } } },
        { services: { some: { name: like } } },
        { brands: { some: { brand: { name: like } } } },
        { categories: { some: { category: { OR: [{ nameEn: like }, { nameAr: { contains: q } }] } } } },
      ],
    });
  }
  if (params.categoryId) and.push({ categories: { some: { categoryId: params.categoryId } } });
  if (params.city) and.push({ OR: [{ city: params.city }, { locations: { some: { city: params.city } } }] });
  if (params.region) and.push({ locations: { some: { region: params.region } } });
  if (params.supplierType) and.push({ supplierTypes: { has: params.supplierType as SupplierTypeEnum } });
  if (params.status) and.push({ status: params.status as SupplierStatus });
  if (params.minScore) and.push({ completeness: { gte: params.minScore } });
  if (params.brand) and.push({ brands: { some: { brand: { name: { contains: params.brand, mode: "insensitive" } } } } });
  if (params.maxCreditDays != null) and.push({ commercialTerms: { creditDays: { lte: params.maxCreditDays } } });
  if (params.deliveryCapability) and.push({ commercialTerms: { deliveryCapability: true } });

  const where: Prisma.SupplierWhereInput = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy: [{ status: "asc" }, { completeness: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { products: true } },
        categories: { include: { category: { select: { nameEn: true } } }, take: 4 },
        brands: { include: { brand: { select: { name: true } } }, take: 4 },
        commercialTerms: { select: { creditDays: true } },
      },
    }),
  ]);

  const results: SupplierCardData[] = rows.map((s) => ({
    id: s.id,
    supplierCode: s.supplierCode,
    companyNameEn: s.companyNameEn,
    companyNameAr: s.companyNameAr,
    city: s.city,
    status: s.status,
    completeness: s.completeness,
    rating: s.rating,
    supplierTypes: s.supplierTypes,
    productCount: s._count.products,
    categories: s.categories.map((c) => c.category.nameEn),
    brands: s.brands.map((b) => b.brand.name),
    creditDays: s.commercialTerms?.creditDays ?? null,
  }));

  return { total, page, pageSize, pages: Math.ceil(total / pageSize), results };
}
