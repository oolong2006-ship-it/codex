import { describe, expect, it } from "vitest";
import { detectQaIssues, wordErrors } from "../src/index.js";

describe("wordErrors", () => {
  it("counts substitutions, deletions and insertions on normalized words", () => {
    expect(wordErrors("الأكل كان زين", "الاكل كان زين")).toEqual({ errors: 0, words: 3 });
    expect(wordErrors("الأكل كان زين مرة", "الأكل زين مره")).toEqual({ errors: 1, words: 4 });
    expect(wordErrors("وش رايك", "وش رايك يا خوي")).toEqual({ errors: 2, words: 2 });
    expect(wordErrors("طلبت برجر", "طلبت بيتزا")).toEqual({ errors: 1, words: 2 });
  });
});

describe("detectQaIssues", () => {
  it("flags one-word non-answers but not acknowledgements", () => {
    const issues = detectQaIssues([
      { turnId: "a", sessionId: "s1", text: "إيه" },
      { turnId: "b", sessionId: "s1", text: "بطاطس" },
    ]);
    expect(issues).toEqual([{ turnId: "b", kind: "too_short", detail: "words=1" }]);
  });

  it("flags answers repeated within an interview", () => {
    const issues = detectQaIssues([
      { turnId: "a", sessionId: "s1", text: "الأكل حلو" },
      { turnId: "b", sessionId: "s1", text: "الأكل حلو" },
      { turnId: "c", sessionId: "s2", text: "الأكل حلو" },
    ]);
    expect(issues).toEqual([{ turnId: "b", kind: "repeated", detail: "same as a" }]);
  });

  it("flags identical long answers across interviews as automated", () => {
    const text = "الخدمة ممتازة والأسعار مناسبة والموظفين محترمين جداً";
    const issues = detectQaIssues([
      { turnId: "a", sessionId: "s1", text },
      { turnId: "b", sessionId: "s2", text },
      { turnId: "c", sessionId: "s3", text: "الخدمة كانت ممتازة بس الأسعار عالية شوي" },
    ]);
    expect(issues.filter((i) => i.kind === "automated").map((i) => i.turnId)).toEqual(["a", "b"]);
  });
});
