import { describe, expect, it } from "vitest";
import {
  checkFile, checkPassword, formatPhoneForDisplay,
  isValidSaudiVat, normalizeSaudiPhone,
} from "@/lib/validation";
import { purchaseRequestSchema, userSchema } from "@/lib/validation";

describe("تطبيع رقم الجوال السعودي", () => {
  it("يقبل الصيغ المعتمدة كلها ويوحّدها", () => {
    const expected = "966559847714";
    for (const input of [
      "0559847714", "559847714", "966559847714",
      "+966559847714", "00966559847714",
      "05 5984 7714", "+966 55 984 7714", "٠٥٥٩٨٤٧٧١٤",
    ]) {
      expect(normalizeSaudiPhone(input), `فشل على: ${input}`).toBe(expected);
    }
  });

  it("يرفض الأرقام غير الصحيحة", () => {
    for (const bad of [
      "0459847714",   // لا يبدأ بـ 5 بعد الصفر
      "05598477",     // ناقص
      "05598477145",  // زائد
      "", "  ", "abcdefghij", "0000000000",
    ]) {
      expect(normalizeSaudiPhone(bad), `كان يجب رفض: ${bad}`).toBeNull();
    }
  });

  it("يعرض الرقم بصيغة محلية مقروءة", () => {
    expect(formatPhoneForDisplay("966559847714")).toBe("055 984 7714");
    expect(formatPhoneForDisplay(null)).toBe("—");
  });
});

describe("الرقم الضريبي السعودي", () => {
  it("يقبل 15 رقمًا يبدأ وينتهي بالرقم 3", () => {
    expect(isValidSaudiVat("310000000000003")).toBe(true);
    expect(isValidSaudiVat("311111111111113")).toBe(true);
  });

  it("يرفض الصيغ الخاطئة", () => {
    expect(isValidSaudiVat("410000000000003")).toBe(false); // لا يبدأ بـ 3
    expect(isValidSaudiVat("310000000000004")).toBe(false); // لا ينتهي بـ 3
    expect(isValidSaudiVat("31000000003")).toBe(false);     // طول خاطئ
    expect(isValidSaudiVat(null)).toBe(false);
  });
});

describe("سياسة كلمة المرور", () => {
  it("يقبل كلمة مرور قوية", () => {
    expect(checkPassword("Nadeg#Secure2026!").ok).toBe(true);
  });

  it("يرفض ما يقل عن 12 حرفًا", () => {
    const r = checkPassword("Ab1!xyz");
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("12"))).toBe(true);
  });

  it("يشترط تنوّع المحارف", () => {
    expect(checkPassword("abcdefghijklmnop").ok).toBe(false);
    expect(checkPassword("ABCDEFGHIJKLMNOP").ok).toBe(false);
    expect(checkPassword("Abcdefghijklmnop").ok).toBe(false);   // بلا رقم
    expect(checkPassword("Abcdefghijkl1234").ok).toBe(false);   // بلا رمز
  });

  it("يرفض الكلمات الشائعة وتكرار المحارف", () => {
    expect(checkPassword("Password123456!").ok).toBe(false);
    expect(checkPassword("Aaaaa1234567!x").ok).toBe(false);
  });

  it("يرفض احتواء كلمة المرور على رقم الجوال", () => {
    const r = checkPassword("Secure847714#Ab", "966559847714");
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("جوالك"))).toBe(true);
  });
});

describe("التحقق من المرفقات", () => {
  const file = (name: string, type: string, size: number) => ({ name, type, size });

  it("يقبل الأنواع المسموحة", () => {
    expect(checkFile(file("invoice.pdf", "application/pdf", 500_000)).ok).toBe(true);
    expect(checkFile(file("photo.jpg", "image/jpeg", 200_000)).ok).toBe(true);
    expect(checkFile(file("scan.png", "image/png", 200_000)).ok).toBe(true);
    expect(checkFile(file("doc.webp", "image/webp", 200_000)).ok).toBe(true);
  });

  it("يرفض الأنواع غير المسموحة", () => {
    const r = checkFile(file("virus.exe", "application/x-msdownload", 1000));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("غير مسموح");
  });

  it("يرفض ما يتجاوز 10 ميجابايت", () => {
    const r = checkFile(file("big.pdf", "application/pdf", 11 * 1024 * 1024));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("10 ميجابايت");
  });

  it("يرفض الامتدادات المزدوجة الخادعة", () => {
    expect(checkFile(file("invoice.pdf.exe", "application/pdf", 1000)).ok).toBe(false);
  });

  it("يقبل الحد الأقصى بالضبط ويرفض الملف الفارغ", () => {
    expect(checkFile(file("ok.pdf", "application/pdf", 10 * 1024 * 1024)).ok).toBe(true);
    expect(checkFile(file("empty.pdf", "application/pdf", 0)).ok).toBe(false);
  });
});

describe("مخطط طلب الشراء", () => {
  const valid = {
    location_id: "11111111-1111-1111-1111-111111111111",
    purchase_date: "2026-09-01",
    purchase_type: "operational" as const,
    priority: "normal" as const,
    supplier_name: "مؤسسة الإمداد",
    supplier_vat: "310000000000003",
    invoice_number: "INV-1",
    invoice_date: "2026-09-02",
    amount_before_vat: 1000,
    vat_amount: 150,
    total_amount: 1150,
    category: "food",
    items_description: "زيت قلي",
    justification: "استهلاك تشغيلي",
  };

  it("يقبل طلبًا صحيحًا", () => {
    expect(purchaseRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("يرفض إجماليًا غير مطابق", () => {
    const r = purchaseRequestSchema.safeParse({ ...valid, total_amount: 9999 });
    expect(r.success).toBe(false);
  });

  it("يرفض رقمًا ضريبيًا خاطئًا", () => {
    expect(purchaseRequestSchema.safeParse({ ...valid, supplier_vat: "123" }).success)
      .toBe(false);
  });

  it("يسمح بترك الرقم الضريبي فارغًا", () => {
    expect(purchaseRequestSchema.safeParse({ ...valid, supplier_vat: "" }).success)
      .toBe(true);
  });

  it("يرفض تاريخ فاتورة يسبق تاريخ الشراء", () => {
    const r = purchaseRequestSchema.safeParse({ ...valid, invoice_date: "2026-08-01" });
    expect(r.success).toBe(false);
  });

  it("يرفض المبالغ السالبة", () => {
    expect(purchaseRequestSchema.safeParse({ ...valid, amount_before_vat: -5 }).success)
      .toBe(false);
  });
});

describe("مخطط المستخدم", () => {
  it("يقبل مستخدمًا صحيحًا", () => {
    const r = userSchema.safeParse({
      full_name: "محمد صالح باعمر",
      phone: "0559847714",
      role: "super_admin",
      location_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(true);
  });

  it("يرفض دورًا غير معروف", () => {
    const r = userSchema.safeParse({
      full_name: "اسم كامل", phone: "0559847714",
      role: "hacker", location_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(false);
  });
});
