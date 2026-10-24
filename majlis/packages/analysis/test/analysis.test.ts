import { MockLlmProvider } from "@majlis/providers";
import { describe, expect, it } from "vitest";
import {
  answerFromMemory,
  buildPersonas,
  buildThemes,
  parseQuestion,
  scoreSentiment,
  type Answer,
  type MemoryHit,
} from "../src/index.js";

describe("scoreSentiment", () => {
  it.each([
    ["الأكل زين والموظفين محترمين", "positive"],
    ["الأسعار غالية والتوصيل متأخر", "negative"],
    ["الأكل مو زين", "negative"],
    ["ما عجبني الطعم", "negative"],
    ["السعر مو غالي", "positive"],
    ["الأكل لذيذ بس غالي", "mixed"],
    ["رحت يوم الخميس مع أهلي", "neutral"],
    ["والطعم رهيب", "positive"],
    ["بصراحة ما يستاهل السعر", "negative"],
    ["الأسعار غالية وما تستاهل الجودة", "negative"],
    ["وما عجبني التوصيل", "negative"],
  ])("%s → %s", (text, label) => {
    expect(scoreSentiment(text).label).toBe(label);
  });
});

const guide = {
  sections: [
    { id: "food", title: "الأكل", questions: [{ id: "q_food" }] },
    { id: "price", title: "السعر", questions: [{ id: "q_price" }] },
    { id: "empty", title: "بدون إجابات", questions: [{ id: "q_none" }] },
  ],
};

const answer = (
  i: number,
  questionId: string,
  text: string,
  participant: Answer["participant"],
): Answer => ({
  turnId: `t${i}`,
  sessionId: `s${i % 4}`,
  studyId: i < 6 ? "study1" : "study2",
  questionId,
  text,
  participant,
});

const women = { gender: "female", city: "jeddah", ageBand: "25-34" };
const men = { gender: "male", city: "riyadh", ageBand: "35-44" };
const answers: Answer[] = [
  answer(0, "q_food", "الأكل لذيذ والطعم رهيب صراحة", women),
  answer(1, "q_food", "الأكل زين والكمية مناسبة للعائلة", men),
  answer(2, "q_price", "الأسعار غالية مرة مقارنة بالكمية", women),
  answer(3, "q_price", "السعر مو غالي يستاهل بصراحة", men),
  answer(4, "q_price", "غالي شوي بس نرجع له، رقمي 0551234567", women),
  answer(5, "q_food", "عادي", women),
  answer(6, "q_price", "الأسعار غالية وما تستاهل الجودة", women),
  answer(7, "q_food", "الطعم ممتاز والموظفين محترمين", men),
];

describe("buildThemes", () => {
  const themes = buildThemes(guide, answers, { redact: (s) => s.replace(/05\d{8}/g, "[محذوف]") });

  it("follows the guide's sections and drops themes without answers", () => {
    expect(themes.map((t) => t.themeId)).toEqual(["food", "price"]);
  });

  it("counts sentiment and breaks it down by segment", () => {
    const price = themes.find((t) => t.themeId === "price")!;
    expect(price.answers).toBe(4);
    expect(price.sentiment).toBe("negative");
    expect(price.breakdown.gender.female!.negative).toBe(3);
    expect(price.breakdown.gender.male!.positive).toBe(1);
    expect(price.breakdown.city.riyadh!.positive).toBe(1);
  });

  it("quotes substantive answers from different sessions, redacted", () => {
    const price = themes.find((t) => t.themeId === "price")!;
    expect(new Set(price.quotes.map((q) => q.turnId)).size).toBe(price.quotes.length);
    expect(price.quotes.map((q) => q.sentiment)).toEqual(
      expect.arrayContaining(["negative", "positive"]),
    );
    expect(price.quotes.every((q) => !q.text.includes("0551234567"))).toBe(true);
    const food = themes.find((t) => t.themeId === "food")!;
    expect(food.quotes.map((q) => q.text)).not.toContain("عادي");
  });
});

describe("buildPersonas", () => {
  const withThemes = answers.map((a) => ({
    ...a,
    themeTitle: a.questionId === "q_price" ? "السعر" : "الأكل",
  }));

  it("forms personas only for segments with enough interviews", () => {
    const personas = buildPersonas(withThemes, { minSessions: 2 });
    const keys = personas.map((p) => p.segmentKey);
    expect(keys).toContain("gender=female");
    expect(keys).toContain("ageBand=25-34&gender=female");
    expect(buildPersonas(withThemes, { minSessions: 5 })).toEqual([]);
  });

  it("captures what a segment praises and complains about, with evidence", () => {
    const female = buildPersonas(withThemes, { minSessions: 2 }).find(
      (p) => p.segmentKey === "gender=female",
    )!;
    expect(female.attributes.complaints[0]).toEqual({ theme: "السعر", count: 3 });
    expect(female.attributes.praises[0]!.theme).toBe("الأكل");
    expect(female.attributes.studies).toBe(2);
    expect(female.evidence.length).toBeGreaterThan(0);
  });
});

describe("parseQuestion", () => {
  it("reads segment filters from Saudi phrasing", () => {
    const q = parseQuestion("وش رأي الأمهات في جدة بأسعارنا؟");
    expect(q.filters).toEqual({ gender: "female", ageBands: [], cities: ["jeddah"], dialects: [] });
    // We never record whether someone is a parent; the answer must say so.
    expect(q.notes).toEqual(["parenthood_not_collected"]);
    expect(q.topicQuery).toContain("اسعارنا");
    expect(q.topicQuery).not.toContain("جده");
  });

  it("handles cities attached to a preposition, age words and English", () => {
    expect(parseQuestion("وش يشوفون الشباب بالرياض عن التوصيل؟").filters).toMatchObject({
      cities: ["riyadh"],
      ageBands: ["18-24", "25-34"],
    });
    expect(parseQuestion("What do women in Dammam think about prices?").filters).toMatchObject({
      gender: "female",
      cities: ["dammam"],
    });
  });
});

describe("answerFromMemory", () => {
  const hits: MemoryHit[] = [
    {
      turnId: "t2",
      sessionId: "s2",
      studyTitle: "دراسة",
      text: "الأسعار غالية مرة مقارنة بالكمية",
      similarity: 0.8,
    },
    {
      turnId: "t6",
      sessionId: "s6",
      studyTitle: "دراسة",
      text: "الأسعار غالية وما تستاهل الجودة",
      similarity: 0.7,
    },
  ];
  const parsed = parseQuestion("وش رأي النساء في جدة بالأسعار؟");

  it("returns an extractive answer with stats when no LLM is configured", async () => {
    const a = await answerFromMemory("سؤال", parsed, hits);
    expect(a).toMatchObject({
      mode: "extractive",
      answer: null,
      stats: { quotes: 2, sessions: 2 },
    });
    expect(a.stats.sentiment.negative).toBe(2);
  });

  it("keeps an LLM answer only when its citations point at real quotes", async () => {
    const good = await answerFromMemory("سؤال", parsed, hits, {
      llm: new MockLlmProvider(["أغلبهن يشوفن الأسعار غالية مقارنة بالكمية [1] والجودة [2]."]),
    });
    expect(good.mode).toBe("llm");
    const invented = await answerFromMemory("سؤال", parsed, hits, {
      llm: new MockLlmProvider(["كلهم يحبون الأسعار [5]."]),
    });
    expect(invented).toMatchObject({ mode: "extractive", answer: null });
    const uncited = await answerFromMemory("سؤال", parsed, hits, {
      llm: new MockLlmProvider(["الأسعار ممتازة عند الجميع."]),
    });
    expect(uncited.mode).toBe("extractive");
  });

  it("says when there is not enough evidence", async () => {
    expect((await answerFromMemory("سؤال", parsed, [])).mode).toBe("insufficient");
  });
});
