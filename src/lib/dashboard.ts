import { prisma } from "@/lib/prisma";

export async function getDashboardData(organizationId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const in30 = new Date(now.getTime() + 30 * 864e5);
  const where = { organizationId };

  const [
    total,
    approved,
    pending,
    rejected,
    newThisMonth,
    products,
    brands,
    categories,
    expiredDocs,
    expiringDocs,
    incomplete,
    byStatusRaw,
  ] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.count({ where: { ...where, status: "APPROVED" } }),
    prisma.supplier.count({ where: { ...where, status: { in: ["SUBMITTED", "UNDER_REVIEW", "PREQUALIFIED"] } } }),
    prisma.supplier.count({ where: { ...where, status: "REJECTED" } }),
    prisma.supplier.count({ where: { ...where, createdAt: { gte: startOfMonth } } }),
    prisma.product.count({ where: { supplier: where } }),
    prisma.brand.count({ where }),
    prisma.category.count({ where }),
    prisma.document.count({ where: { supplier: where, expiryDate: { lt: now } } }),
    prisma.document.count({ where: { supplier: where, expiryDate: { gte: now, lte: in30 } } }),
    prisma.supplier.count({ where: { ...where, status: "PROFILE_INCOMPLETE" } }),
    prisma.supplier.groupBy({ by: ["status"], where, _count: true }),
  ]);

  // Top categories by supplier count
  const catCounts = await prisma.supplierCategory.groupBy({
    by: ["categoryId"],
    where: { category: { organizationId } },
    _count: true,
    orderBy: { _count: { categoryId: "desc" } },
    take: 8,
  });
  const catNames = await prisma.category.findMany({
    where: { id: { in: catCounts.map((c) => c.categoryId) } },
    select: { id: true, nameEn: true },
  });
  const nameMap = new Map(catNames.map((c) => [c.id, c.nameEn]));
  const topCategories = catCounts.map((c) => ({ name: nameMap.get(c.categoryId) ?? "—", count: c._count }));

  // Coverage by city
  const cityGroups = await prisma.supplier.groupBy({
    by: ["city"],
    where: { ...where, city: { not: null } },
    _count: true,
    orderBy: { _count: { city: "desc" } },
    take: 8,
  });
  const coverageByCity = cityGroups.map((c) => ({ city: c.city ?? "—", count: c._count }));

  // New suppliers trend — last 6 months
  const trend: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const count = await prisma.supplier.count({ where: { ...where, createdAt: { gte: from, lt: to } } });
    trend.push({ month: from.toLocaleDateString("en", { month: "short" }), count });
  }

  const byStatus = byStatusRaw.map((s) => ({ status: s.status, count: s._count }));

  return {
    total, approved, pending, rejected, newThisMonth,
    products, brands, categories, expiredDocs, expiringDocs, incomplete,
    topCategories, coverageByCity, trend, byStatus,
  };
}
