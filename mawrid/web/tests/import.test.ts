import { describe, expect, it } from "vitest";
import { matchHeader, rowToRawSupplier } from "@/lib/columns";
import { CATEGORIES, CERTIFICATES, CITIES, DAYS } from "@/lib/constants";
import { planImport } from "@/lib/import";

const LISTS = { categories: CATEGORIES, cities: CITIES, days: DAYS, certificates: CERTIFICATES };

describe("matchHeader", () => {
  it("يطابق العناوين العربية والإنجليزية بأي همزة أو مسافة", () => {
    expect(matchHeader("الاسم التجاري")).toBe("name");
    expect(matchHeader("الأسم  التجارى")).toBe("name");
    expect(matchHeader("Supplier Name")).toBe("name");
    expect(matchHeader("CR Number")).toBe("cr");
    expect(matchHeader("VAT")).toBe("vat");
    expect(matchHeader("مدة الآجل (يوم)")).toBe("credit_days");
    expect(matchHeader("legalName")).toBe("legal_name");
    expect(matchHeader("عمود غريب")).toBeUndefined();
  });
});

describe("rowToRawSupplier", () => {
  it("يفصل القيم المتعددة ويطابقها مع القوائم", () => {
    const r = rowToRawSupplier({ "التصنيفات": "لحوم و دواجن | مجمدات، الألبان والأجبان",
      "التغطية": "الرياض,جده", "المدينة": "الرياض" }, LISTS);
    expect(r.categories).toEqual(["لحوم ودواجن", "مجمدات", "الألبان والأجبان"]);
    expect(r.coverage).toEqual(["الرياض", "جدة"]);
  });
  it("يطبّع الدفع والحالة والتقييم", () => {
    expect(rowToRawSupplier({ "الدفع": "كاش + آجل" }, LISTS).payment).toBe("نقدي وآجل");
    expect(rowToRawSupplier({ "payment": "Credit" }, LISTS).payment).toBe("آجل");
    expect(rowToRawSupplier({ "التوثيق": "موثق" }, LISTS).status).toBe("موثّق");
    expect(rowToRawSupplier({ "التوثيق": "غير موثق" }, LISTS).status).toBe("غير موثّق");
    expect(rowToRawSupplier({ "التوثيق": "نعم" }, LISTS).status).toBe("قيد التحقق");
    expect(rowToRawSupplier({}, LISTS).status).toBe("قيد التحقق");
    expect(rowToRawSupplier({ "التقييم": "9" }, LISTS).rating).toBe(5);
    expect(rowToRawSupplier({ "أيام الآجل": "60 يوم" }, LISTS).credit_days).toBe(60);
  });
});

describe("planImport", () => {
  const rows = [
    { "الاسم التجاري": "مورد أ", "المدينة": "الرياض", "التصنيفات": "مجمدات", "السجل التجاري": "1010000001" },
    { "الاسم التجاري": "مورد أ المحدّث", "المدينة": "الرياض", "التصنيفات": "مجمدات", "السجل التجاري": "١٠١٠٠٠٠٠٠١" },
    { "الاسم التجاري": "", "المدينة": "", "التصنيفات": "" },
    { "الاسم التجاري": "مورد ب", "المدينة": "الرياض", "التصنيفات": "تصنيف وهمي" },
    { "الاسم التجاري": "مورد ج", "المدينة": "الرياض", "التصنيفات": "مجمدات", "الرقم الضريبي": "123", "المصدر": "ERP الناضج" },
    { "الاسم التجاري": "مورد د", "المدينة": "الرياض", "التصنيفات": "خضار وفواكه", "عمود إضافي": "x" },
  ];
  const plan = planImport(rows, "بحث عام");

  it("يدمج المكرر داخل الملف حسب السجل ويعتمد آخر صف", () => {
    expect(plan.merged).toBe(1);
    const a = plan.valid.find((v) => v.key === "cr-1010000001");
    expect(a?.data.name).toBe("مورد أ المحدّث");
    expect(a?.row).toBe(3);
  });
  it("يتجاهل الصفوف الفارغة", () => { expect(plan.blank).toBe(1); });
  it("يبلغ عن الأخطاء برقم الصف كما في Excel", () => {
    expect(plan.errors.map((e) => e.row)).toEqual([5, 6]);
    expect(plan.errors[0].messages.join()).toContain("تصنيف");
    expect(plan.errors[1].messages.join()).toContain("الرقم الضريبي");
  });
  it("يضع المصدر الافتراضي والحالة «قيد التحقق»", () => {
    const d = plan.valid.find((v) => v.data.name === "مورد د");
    expect(d?.data.source).toBe("بحث عام");
    expect(d?.data.status).toBe("قيد التحقق");
  });
  it("يبلغ عن الأعمدة غير المعروفة", () => { expect(plan.unknownHeaders).toEqual(["عمود إضافي"]); });
});
