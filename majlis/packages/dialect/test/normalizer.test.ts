import { describe, expect, it } from "vitest";
import { normalizeForSpeech, spokenNumber } from "../src/index.js";

describe("spokenNumber", () => {
  it.each([
    [0, "صفر"],
    [2, "اثنين"],
    [10, "عشرة"],
    [15, "خمسطعش"],
    [20, "عشرين"],
    [25, "خمسة وعشرين"],
    [100, "مية"],
    [150, "مية وخمسين"],
    [200, "ميتين"],
    [350, "ثلاثمية وخمسين"],
    [1000, "ألف"],
    [2000, "ألفين"],
    [3000, "ثلاث آلاف"],
    [15000, "خمسطعش ألف"],
    [2026, "ألفين وستة وعشرين"],
    [1_500_000, "مليون وخمسمية ألف"],
    [3_000_000, "ثلاث ملايين"],
  ])("%i → %s", (n, words) => {
    expect(spokenNumber(n)).toBe(words);
  });

  it("uses Hijazi teens for Hijazi speakers", () => {
    expect(spokenNumber(15, "hijazi")).toBe("خمستاشر");
    expect(spokenNumber(13, "msa_simple")).toBe("ثلاثة عشر");
  });
});

describe("normalizeForSpeech", () => {
  it.each([
    ["الطلب بـ 25 ريال", "الطلب بـ خمسة وعشرين ريال"],
    ["سعره 25.50 ر.س", "سعره خمسة وعشرين ريال ونص"],
    ["دفعت ١٥٠ ريالاً", "دفعت مية وخمسين ريال"],
    ["SAR 2", "ريالين"],
    ["بـ 1 ريال", "بـ ريال واحد"],
    ["0.25 ريال", "ربع ريال"],
    ["خصم 15%", "خصم خمسطعش بالمية"],
    ["الساعة 9:30", "الساعة تسع ونص"],
    ["الساعة 21:15", "الساعة تسع وربع بالليل"],
    ["الساعة 7:45 م", "الساعة ثمان إلا ربع بالليل"],
    ["الساعة 2:00 م", "الساعة ثنتين الظهر"],
    ["يوم 24/10/2026", "يوم أربعة وعشرين أكتوبر ألفين وستة وعشرين"],
    ["2026-01-05", "خمسة يناير ألفين وستة وعشرين"],
    ["عندهم 3 فروع", "عندهم ثلاثة فروع"],
    ["الرقم 0551234567", "الرقم صفر خمسة خمسة واحد اثنين ثلاثة أربعة خمسة ستة سبعة"],
  ])("%s", (input, expected) => {
    expect(normalizeForSpeech(input)).toBe(expected);
  });

  it("never produces written-MSA number forms", () => {
    const out = normalizeForSpeech("25 ريال و 125 ريال و 1,250 ريال");
    expect(out).not.toMatch(/عشرون|ريالاً|مائة/);
    expect(out).toBe("خمسة وعشرين ريال و مية وخمسة وعشرين ريال و ألف وميتين وخمسين ريال");
  });

  it("says brand names the Saudi way and leaves other English alone", () => {
    expect(normalizeForSpeech("طلبت من HungerStation والـ delivery تأخر")).toBe(
      "طلبت من هنقرستيشن والـ delivery تأخر",
    );
    expect(normalizeForSpeech("دفعت بـ apple pay")).toBe("دفعت بـ أبل باي");
  });

  it("follows the dialect for teens", () => {
    expect(normalizeForSpeech("15 ريال", { dialect: "hijazi" })).toBe("خمستاشر ريال");
  });
});
