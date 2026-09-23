import { describe, expect, it } from "vitest";
import { dedupKey, digitsOnly, normalizeAr } from "@/lib/normalize";

// نفس الحالات في supabase/tests/20_suppliers_tests.sql — لضمان تطابق التطبيع بين الواجهة وقاعدة البيانات
describe("normalizeAr", () => {
  it("يحذف التشكيل والتطويل ويوحّد الهمزات والتاء", () => {
    expect(normalizeAr("مُؤَسَّسَةُ الأَمْــانة")).toBe("موسسه الامانه");
  });
  it("إ/آ→ا والشدة وى→ي", () => {
    expect(normalizeAr("إبراهيم آل مكّى")).toBe("ابراهيم ال مكي");
  });
  it("الأرقام العربية والمسافات", () => {
    expect(normalizeAr("  رقم  ١٢٣  ")).toBe("رقم 123");
  });
  it("يحوّل الإنجليزية لأحرف صغيرة", () => {
    expect(normalizeAr("HACCP Iso")).toBe("haccp iso");
  });
});

describe("dedupKey", () => {
  it("يعتمد السجل التجاري إن وُجد", () => {
    expect(dedupKey("١٠١٠-٠٠٠٠٠١", "x", "y")).toBe("cr-1010000001");
  });
  it("وإلا الاسم والمدينة المطبّعين", () => {
    expect(dedupKey(null, "مخبز  الأمانة", "جدة")).toBe("n-مخبز الامانه|جده");
    expect(dedupKey("", "مخبز الامانه", "جده")).toBe(dedupKey(null, "مَخبز الأمانة", "جدة"));
  });
  it("digitsOnly", () => {
    expect(digitsOnly("1010 123 ٤٥٦")).toBe("1010123456");
  });
});
