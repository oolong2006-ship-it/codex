import { describe, expect, it } from "vitest";
import {
  DIALECTS,
  checkDialectText,
  correctTranscript,
  detectDialect,
  dialectCorrectness,
  loadLexicon,
  normalizeForMatch,
} from "../src/index.js";

describe("lexicon", () => {
  it("loads every dialect with markers and backchannels", () => {
    const lex = loadLexicon();
    for (const d of DIALECTS) {
      expect(lex.dialects[d].markers.length, d).toBeGreaterThan(0);
      expect(lex.dialects[d].backchannels.length, d).toBeGreaterThan(0);
      expect(lex.dialects[d].status, d).toMatch(/draft/);
    }
  });

  it("has no marker claimed by two dialects at full weight", () => {
    const lex = loadLexicon();
    const strong = new Map<string, string>();
    for (const d of DIALECTS) {
      for (const m of lex.dialects[d].markers.filter((m) => m.weight >= 2)) {
        const key = normalizeForMatch(m.w);
        expect(strong.get(key), `${m.w} in ${d} and ${strong.get(key)}`).toBeUndefined();
        strong.set(key, d);
      }
    }
  });
});

describe("detectDialect", () => {
  it.each([
    [["والله الأكل زين مير الأسعار زود"], "najdi"],
    [["ايش أقولك، الأكل مرة حلو بس دحين صار غالي"], "hijazi"],
    [["الأكل وايد زين بس شكثر الأسعار غالية"], "eastern"],
    [["لماذا ارتفعت الأسعار؟ لا أعلم صراحةً"], "msa_simple"],
  ])("%s → %s", (utterances, expected) => {
    expect(detectDialect(utterances).dialect).toBe(expected);
  });

  it("stays undecided on neutral or too-short speech", () => {
    expect(detectDialect(["الأكل حلو"]).dialect).toBeNull();
    expect(detectDialect(["إيه"]).dialect).toBeNull();
  });

  it("reports the evidence it used", () => {
    const result = detectDialect(["وش رايك؟ مير الأكل زين"]);
    expect(result.evidence.map((e) => e.marker)).toEqual(expect.arrayContaining(["وش", "مير"]));
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

describe("dialect checks", () => {
  it("flags written-MSA and foreign-dialect phrases", () => {
    expect(checkDialectText("سعره خمسة وعشرون ريالاً", "najdi").map((i) => i.phrase)).toEqual([
      "ريالاً",
      "خمسة وعشرون",
    ]);
    expect(checkDialectText("دحين وش رايك؟", "najdi").map((i) => i.phrase)).toEqual(["دحين"]);
    expect(checkDialectText("إيه، فاهم عليك. وش اللي عجبك؟", "najdi")).toEqual([]);
  });

  it("allows formal forms in simplified MSA", () => {
    expect(checkDialectText("سوف نبدأ الآن", "msa_simple")).toEqual([]);
    expect(checkDialectText("سوف نبدأ الحين", "najdi")).toHaveLength(1);
  });

  it("computes dialect correctness over sentences", () => {
    expect(dialectCorrectness(["إيه", "سوف نكمل", "زين", "صح"], "najdi")).toBe(0.75);
  });

  it("normalizes common ASR spellings", () => {
    expect(correctTranscript("انشالله يكون زين، ماشالله")).toBe(
      "إن شاء الله يكون زين، ما شاء الله",
    );
  });
});
