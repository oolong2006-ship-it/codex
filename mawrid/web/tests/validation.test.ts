import { describe, expect, it } from "vitest";
import { validateSupplier } from "@/lib/validation";

const base = { name: "مورد", city: "الرياض", categories: ["مجمدات"], source: "فريق المشتريات",
  status: "قيد التحقق", payment: "نقدي", credit_days: 0, rating: 0 };
const blanks = { legal_name: "", cr: "", vat: "", district: "", national_address: "", contact_name: "",
  contact_role: "", phone: "", whatsapp: "", email: "", website: "", products: "", coverage: [],
  delivery_days: [], lead_time: "", moq: "", certificates: [], sfda_license: "", notes: "" };

describe("validateSupplier", () => {
  it("يقبل الحد الأدنى ويحوّل الفارغ إلى null", () => {
    const r = validateSupplier({ ...blanks, ...base });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.data.cr).toBeNull(); expect(r.data.email).toBeNull(); }
  });
  it("ينظّف السجل والرقم الضريبي والبريد والموقع", () => {
    const r = validateSupplier({ ...blanks, ...base, cr: "١٠١٠ ١٢٣ ٤٥٦", vat: "300000000000013",
      email: " Sales@X.COM ", website: "example.com", national_address: "rrrd2929" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.cr).toBe("1010123456");
      expect(r.data.email).toBe("sales@x.com");
      expect(r.data.website).toBe("https://example.com/");
      expect(r.data.national_address).toBe("RRRD2929");
    }
  });
  it("يرفض المدخلات غير الصحيحة برسائل عربية", () => {
    const r = validateSupplier({ ...blanks, ...base, name: "", cr: "123", vat: "123456789012345",
      categories: [], email: "x@", source: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["categories", "cr", "email", "name", "source", "vat"]);
      expect(r.errors.categories).toBe("اختر تصنيفاً واحداً على الأقل");
    }
  });
  it("يحذف القيم غير المدرجة في القوائم الثابتة والمكرر", () => {
    const r = validateSupplier({ ...blanks, ...base, categories: ["مجمدات", "مجمدات", "غير موجود"] });
    expect(r.ok && r.data.categories).toEqual(["مجمدات"]);
  });
});
