/* eslint-disable no-console */
import { PrismaClient, type SupplierStatus, type SupplierTypeEnum, type BrandRelationship } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DOCUMENT_TYPES, SAUDI_CITIES, SAUDI_REGIONS } from "../src/lib/constants";
import { DEFAULT_CATEGORY_RULES } from "../src/lib/rules";
import { computeCompleteness } from "../src/lib/completeness";
import { slugify } from "../src/lib/utils";

const prisma = new PrismaClient();

// Deterministic PRNG so seeds are reproducible.
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const pickN = <T>(arr: T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
};
const chance = (p: number) => rand() < p;

const TAXONOMY: { name: string; nameAr: string; subs: { name: string; nameAr: string; groups?: string[] }[] }[] = [
  { name: "Food & Beverage", nameAr: "الأغذية والمشروبات", subs: [
    { name: "Poultry", nameAr: "الدواجن", groups: ["Frozen Chicken", "Fresh Chicken"] },
    { name: "Meat", nameAr: "اللحوم" }, { name: "Dairy", nameAr: "الألبان" },
    { name: "Beverages", nameAr: "المشروبات" }, { name: "Coffee", nameAr: "القهوة" },
  ]},
  { name: "Packaging", nameAr: "التغليف", subs: [
    { name: "Cartons", nameAr: "الكراتين" }, { name: "Plastic Bags", nameAr: "الأكياس البلاستيكية" }, { name: "Food Packaging", nameAr: "تغليف الأغذية" },
  ]},
  { name: "Cleaning", nameAr: "التنظيف", subs: [
    { name: "Detergents", nameAr: "المنظفات" }, { name: "Hygiene Supplies", nameAr: "مستلزمات النظافة" },
  ]},
  { name: "Kitchen Equipment", nameAr: "معدات المطابخ", subs: [
    { name: "Commercial Refrigeration", nameAr: "التبريد التجاري", groups: ["Freezers", "Cold Rooms", "Refrigerators"] },
    { name: "Cooking Equipment", nameAr: "معدات الطهي" }, { name: "Dishwashing", nameAr: "غسيل الصحون" },
  ]},
  { name: "Maintenance", nameAr: "الصيانة", subs: [
    { name: "HVAC", nameAr: "التكييف والتهوية", groups: ["Commercial AC", "Chillers"] },
    { name: "Electrical", nameAr: "الكهرباء" }, { name: "Plumbing", nameAr: "السباكة" },
  ]},
  { name: "Construction", nameAr: "المقاولات", subs: [
    { name: "Cement & Concrete", nameAr: "الأسمنت والخرسانة" }, { name: "Steel", nameAr: "الحديد" }, { name: "Finishing", nameAr: "التشطيبات" },
  ]},
  { name: "IT", nameAr: "تقنية المعلومات", subs: [
    { name: "Hardware", nameAr: "الأجهزة" }, { name: "Servers", nameAr: "الخوادم" }, { name: "Networking", nameAr: "الشبكات" }, { name: "Software", nameAr: "البرمجيات" },
  ]},
  { name: "Furniture", nameAr: "الأثاث", subs: [
    { name: "Office Furniture", nameAr: "أثاث المكاتب" }, { name: "Seating", nameAr: "الكراسي" },
  ]},
  { name: "Logistics", nameAr: "الخدمات اللوجستية", subs: [
    { name: "Transport", nameAr: "النقل" }, { name: "Warehousing", nameAr: "التخزين" },
  ]},
  { name: "Professional Services", nameAr: "الخدمات المهنية", subs: [
    { name: "Consulting", nameAr: "الاستشارات" }, { name: "Marketing", nameAr: "التسويق" },
  ]},
];

const BRANDS = [
  "Al Rajhi", "Almarai", "SADAFCO", "Panasonic", "Samsung", "LG", "Carrier", "Daikin",
  "Bosch", "Siemens", "Dell", "HP", "Cisco", "Lenovo", "Hoshizaki", "Rational",
  "Tetra Pak", "Napco", "Zamil", "Saudi Ceramics",
];

const SUPPLIER_TYPES: SupplierTypeEnum[] = ["MANUFACTURER", "AUTHORIZED_AGENT", "DISTRIBUTOR", "WHOLESALER", "RETAILER", "SERVICE_PROVIDER", "CONTRACTOR", "IMPORTER"];
const STATUSES: SupplierStatus[] = ["APPROVED", "APPROVED", "APPROVED", "UNDER_REVIEW", "SUBMITTED", "PREQUALIFIED", "PROFILE_INCOMPLETE", "CONDITIONAL", "REJECTED", "SUSPENDED"];
const RELATIONSHIPS: BrandRelationship[] = ["MANUFACTURER", "AGENT", "DISTRIBUTOR", "RESELLER"];

const COMPANY_PREFIX = ["Al Faisal", "Riyadh", "Gulf", "Arabian", "National", "United", "Modern", "Advanced", "Prime", "Sahara", "Najd", "Tamimi", "Bin Saeed", "Al Nahda", "Rawabi"];
const COMPANY_SUFFIX = ["Trading Co.", "Est.", "Industries", "Group", "Company", "Foods", "Systems", "Solutions", "Contracting", "Enterprises"];

async function main() {
  console.log("Seeding Supplier Intelligence Hub…");
  const password = process.env.SEED_DEMO_PASSWORD || "Demo!Passw0rd";
  const hash = await bcrypt.hash(password, 12);

  // Clean (dev only)
  await prisma.organization.deleteMany({});

  const org = await prisma.organization.create({ data: { name: "Acme Procurement", slug: "demo" } });

  // Users
  const users = await Promise.all([
    prisma.user.create({ data: { organizationId: org.id, email: "superadmin@demo.sa", passwordHash: hash, name: "Super Admin", role: "SUPER_ADMIN" } }),
    prisma.user.create({ data: { organizationId: org.id, email: "admin@demo.sa", passwordHash: hash, name: "Procurement Admin", role: "PROCUREMENT_ADMIN" } }),
    prisma.user.create({ data: { organizationId: org.id, email: "buyer@demo.sa", passwordHash: hash, name: "Procurement User", role: "PROCUREMENT_USER" } }),
  ]);
  const admins = [users[0].id, users[1].id];

  // Document types
  const docTypes = await Promise.all(
    DOCUMENT_TYPES.map((d) => prisma.documentType.create({ data: { organizationId: org.id, code: d.code, nameEn: d.en, nameAr: d.ar, hasExpiry: d.hasExpiry } })),
  );
  const docTypeByCode = new Map(docTypes.map((d) => [d.code, d]));

  // Taxonomy
  const catByName = new Map<string, string>();
  const subByRoot = new Map<string, { id: string; name: string; nameAr: string }[]>();
  for (const cat of TAXONOMY) {
    const root = await prisma.category.create({ data: { organizationId: org.id, nameEn: cat.name, nameAr: cat.nameAr, slug: slugify(cat.name), level: 0 } });
    catByName.set(cat.name, root.id);
    const subs: { id: string; name: string; nameAr: string }[] = [];
    for (const sub of cat.subs) {
      const s = await prisma.category.create({ data: { organizationId: org.id, parentId: root.id, nameEn: sub.name, nameAr: sub.nameAr, slug: slugify(`${cat.name}-${sub.name}`), level: 1 } });
      subs.push({ id: s.id, name: sub.name, nameAr: sub.nameAr });
      for (const g of sub.groups ?? []) {
        await prisma.category.create({ data: { organizationId: org.id, parentId: s.id, nameEn: g, nameAr: g, slug: slugify(`${cat.name}-${sub.name}-${g}`), level: 2 } });
      }
    }
    subByRoot.set(cat.name, subs);
  }

  // Requirement rules
  for (const [slugKey, codes] of Object.entries(DEFAULT_CATEGORY_RULES)) {
    const rootName = TAXONOMY.find((t) => slugify(t.name) === slugKey)?.name;
    if (!rootName) continue;
    const catId = catByName.get(rootName)!;
    for (const code of codes) {
      const dt = docTypeByCode.get(code);
      if (!dt) continue;
      await prisma.requirementRule.create({ data: { organizationId: org.id, categoryId: catId, documentTypeId: dt.id, mandatory: true } });
    }
  }

  // Brands
  const brandRecords = await Promise.all(
    BRANDS.map((b) => prisma.brand.create({ data: { organizationId: org.id, name: b, country: pick(["Saudi Arabia", "Japan", "Germany", "USA", "South Korea"]) } })),
  );

  const rootNames = TAXONOMY.map((t) => t.name);
  let supplierProductTotal = 0;

  // Suppliers
  for (let i = 1; i <= 50; i++) {
    const code = `SUP-${String(i).padStart(6, "0")}`;
    const nameEn = `${pick(COMPANY_PREFIX)} ${pick(["Kitchen", "Food", "Tech", "Build", "Clean", "Cool", "Metal", "Pack", "Office", "Logi"])} ${pick(COMPANY_SUFFIX)}`;
    const nameAr = `شركة ${pick(["الفيصل", "الرياض", "الخليج", "العربية", "الوطنية", "المتحدة", "الحديثة", "المتقدمة"])} ${pick(["للتجارة", "للصناعة", "للمقاولات", "للخدمات"])}`;
    const rootName = pick(rootNames);
    const subs = subByRoot.get(rootName)!;
    const chosenSubs = pickN(subs, 1 + Math.floor(rand() * 2));
    const city = pick([...SAUDI_CITIES]);
    const status = pick(STATUSES);
    const types = pickN(SUPPLIER_TYPES, 1 + Math.floor(rand() * 2));

    const isSupplierAccount = i === 1; // First supplier gets a login account.
    let ownerUserId: string | null = null;
    if (isSupplierAccount) {
      const su = await prisma.user.create({ data: { organizationId: org.id, email: "supplier@demo.sa", passwordHash: hash, name: "Demo Supplier", role: "SUPPLIER" } });
      ownerUserId = su.id;
    }

    const supplier = await prisma.supplier.create({
      data: {
        organizationId: org.id,
        ownerUserId,
        supplierCode: code,
        companyNameEn: nameEn,
        companyNameAr: nameAr,
        crNumber: `10${String(100000 + Math.floor(rand() * 899999))}`,
        vatNumber: `3${String(100000000000 + Math.floor(rand() * 899999999999))}`,
        iban: `SA${String(10 + Math.floor(rand() * 89))}${String(1000000000000000000000n + BigInt(Math.floor(rand() * 1e6)))}`.slice(0, 24),
        companyType: pick(["LLC", "Est.", "JSC"]),
        yearEstablished: 1990 + Math.floor(rand() * 33),
        country: "Saudi Arabia",
        city,
        headquarters: `${city}, Saudi Arabia`,
        website: `https://${slugify(nameEn).slice(0, 20)}.sa`,
        employeeCount: pick(["1-10", "11-50", "51-200", "201-500", "500+"]),
        annualRevenue: pick(["< 1M", "1M-10M", "10M-50M", "50M+"]),
        emailDomain: `${slugify(nameEn).slice(0, 20)}.sa`,
        primaryPhone: `+96650${String(1000000 + Math.floor(rand() * 8999999))}`,
        supplierTypes: types,
        status,
        aiPrimaryCategory: rootName,
        aiKeywords: [rootName.toLowerCase(), ...chosenSubs.map((s) => s.name.toLowerCase())],
        contacts: {
          create: [{ name: pick(["Ahmed Ali", "Sara Mohammed", "Khalid Otaibi", "Noura Salem", "Faisal Harbi"]), jobTitle: pick(["Sales Manager", "GM", "Business Dev", "Owner"]), email: `contact@${slugify(nameEn).slice(0, 15)}.sa`, mobile: `+96650${String(1000000 + Math.floor(rand() * 8999999))}`, isPrimary: true }],
        },
        categories: { create: chosenSubs.map((s, idx) => ({ categoryId: s.id, isPrimary: idx === 0 })) },
        commercialTerms: {
          create: {
            paymentTerms: pick(["Net 30", "Net 60", "Net 90", "Cash on Delivery"]),
            creditDays: pick([0, 30, 45, 60, 90]),
            minimumOrder: pick(["SAR 1,000", "SAR 5,000", "SAR 10,000"]),
            deliveryLeadTime: pick(["2-3 days", "1 week", "2 weeks"]),
            deliveryCapability: chance(0.8),
            warehouseAvailable: chance(0.6),
            fleetAvailable: chance(0.5),
            importCapability: chance(0.4),
          },
        },
        locations: {
          create: [
            { country: "Saudi Arabia", region: pick([...SAUDI_REGIONS]), city },
            ...(chance(0.5) ? [{ country: "Saudi Arabia", region: pick([...SAUDI_REGIONS]), city: pick([...SAUDI_CITIES]) }] : []),
          ],
        },
      },
    });

    // Products
    const productCount = 1 + Math.floor(rand() * 3);
    for (let p = 0; p < productCount; p++) {
      const sub = pick(chosenSubs);
      await prisma.product.create({
        data: {
          supplierId: supplier.id,
          categoryId: sub.id,
          nameEn: `${sub.name} ${pick(["Pro", "Max", "Standard", "Premium", "X200", "Series 3"])}`,
          nameAr: sub.nameAr,
          sku: `SKU-${i}-${p}`,
          brand: pick(BRANDS),
          model: `M-${100 + Math.floor(rand() * 900)}`,
          countryOfOrigin: pick(["Saudi Arabia", "China", "Germany", "Turkey", "Italy"]),
          unitOfMeasure: pick(["pcs", "box", "kg", "unit"]),
          minOrderQty: pick([1, 10, 50, 100]),
          leadTime: pick(["1 week", "2 weeks", "1 month"]),
          warranty: pick(["1 year", "2 years", "None"]),
          source: chance(0.2) ? "AI" : "MANUAL",
        },
      });
      supplierProductTotal++;
    }

    // Services (some suppliers)
    if (types.includes("SERVICE_PROVIDER") || chance(0.3)) {
      await prisma.service.create({
        data: {
          supplierId: supplier.id,
          name: `${rootName} maintenance & support`,
          category: rootName,
          description: "On-site service, warranty and spare parts.",
          citiesCovered: pickN([...SAUDI_CITIES], 3),
          sla: pick(["24h response", "48h response", "Next business day"]),
          experienceYears: 1 + Math.floor(rand() * 20),
        },
      });
    }

    // Brands
    for (const b of pickN(brandRecords, 1 + Math.floor(rand() * 3))) {
      await prisma.supplierBrand.create({ data: { supplierId: supplier.id, brandId: b.id, relationship: pick(RELATIONSHIPS) } }).catch(() => {});
    }

    // Documents — CR + VAT always; others sometimes; some expiring/expired.
    const now = Date.now();
    const mkDoc = async (code: string, expiryOffsetDays: number | null) => {
      const dt = docTypeByCode.get(code);
      if (!dt) return;
      await prisma.document.create({
        data: {
          supplierId: supplier.id,
          documentTypeId: dt.id,
          fileName: `${code.toLowerCase()}.pdf`,
          filePath: `seed/${code.toLowerCase()}.pdf`,
          fileSize: 120000,
          mimeType: "application/pdf",
          documentNumber: `DOC-${Math.floor(rand() * 100000)}`,
          issueDate: new Date(now - 200 * 864e5),
          expiryDate: expiryOffsetDays == null ? null : new Date(now + expiryOffsetDays * 864e5),
          status: status === "APPROVED" ? "VALID" : "PENDING_VERIFICATION",
        },
      });
    };
    await mkDoc("COMMERCIAL_REGISTRATION", pick([400, 200, 20, -10]));
    await mkDoc("VAT_CERTIFICATE", null);
    if (chance(0.7)) await mkDoc("NATIONAL_ADDRESS", null);
    if (chance(0.7)) await mkDoc("IBAN_CERTIFICATE", null);
    if (chance(0.5)) await mkDoc("COMPANY_PROFILE", null);
    if (chance(0.4)) await mkDoc("ISO_CERTIFICATE", pick([500, 25, -5]));
    if (rootName === "Food & Beverage" && chance(0.8)) await mkDoc("SFDA_CERTIFICATE", pick([300, 15]));

    // Recompute completeness
    const full = await prisma.supplier.findUnique({
      where: { id: supplier.id },
      include: { contacts: true, categories: true, products: true, documents: { include: { documentType: true } }, certifications: true },
    });
    if (full) {
      const { score } = computeCompleteness(full);
      await prisma.supplier.update({ where: { id: supplier.id }, data: { completeness: score } });
    }

    // Status history + activity
    await prisma.supplierStatusHistory.create({ data: { supplierId: supplier.id, fromStatus: null, toStatus: "REGISTERED", changedById: pick(admins) } });
    if (status !== "REGISTERED" && status !== "PROFILE_INCOMPLETE") {
      await prisma.supplierStatusHistory.create({ data: { supplierId: supplier.id, fromStatus: "SUBMITTED", toStatus: status, reason: "Seed review", changedById: pick(admins) } });
    }
    await prisma.activityLog.create({ data: { organizationId: org.id, supplierId: supplier.id, actorId: pick(admins), action: "SUPPLIER_REGISTERED", detail: `${nameEn} (${code})` } });

    // Notes & evaluations for approved suppliers
    if (status === "APPROVED") {
      if (chance(0.4)) await prisma.supplierNote.create({ data: { supplierId: supplier.id, authorId: pick(admins), body: pick(["Strong pricing in this category.", "Visited HQ — professional operation.", "Reliable delivery in Riyadh.", "Good after-sales support."]) } });
      if (chance(0.5)) {
        const scoreVal = 3 + Math.floor(rand() * 3);
        await prisma.supplierEvaluation.create({ data: { supplierId: supplier.id, authorId: pick(admins), score: scoreVal, outcome: scoreVal >= 4 ? "POSITIVE" : "NEUTRAL", comment: "Seed evaluation." } });
        const agg = await prisma.supplierEvaluation.aggregate({ where: { supplierId: supplier.id }, _avg: { score: true } });
        await prisma.supplier.update({ where: { id: supplier.id }, data: { rating: agg._avg.score } });
      }
    }
  }

  // A demo shortlist
  const approved = await prisma.supplier.findMany({ where: { organizationId: org.id, status: "APPROVED" }, take: 3, select: { id: true } });
  if (approved.length) {
    await prisma.shortlist.create({
      data: {
        organizationId: org.id, ownerId: users[2].id, name: "New Kitchen Equipment", project: "HQ cafeteria refit",
        suppliers: { create: approved.map((s) => ({ supplierId: s.id })) },
      },
    });
  }

  console.log(`✓ Seeded 1 org, ${users.length + 1} users, ${TAXONOMY.length} categories, ${brandRecords.length} brands, 50 suppliers, ${supplierProductTotal} products.`);
  console.log("\nDemo accounts (password below):");
  console.log("  Super Admin:        superadmin@demo.sa");
  console.log("  Procurement Admin:  admin@demo.sa");
  console.log("  Procurement User:   buyer@demo.sa");
  console.log("  Supplier:           supplier@demo.sa");
  console.log(`  Password:           ${password}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
