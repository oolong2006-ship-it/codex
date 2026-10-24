import { MockLlmProvider } from "@majlis/providers";
import { describe, expect, it } from "vitest";
import {
  InterviewEngine,
  TEMPLATE_IDS,
  checkUtterance,
  fromTemplate,
  generateStudy,
  pickTemplate,
  validateGuide,
} from "../src/index.js";

describe("templates", () => {
  it.each(TEMPLATE_IDS)("%s is a valid guide whose wording passes the guardrails", (id) => {
    const study = fromTemplate(id, "مطعم البيت");
    validateGuide({ ...study.guide, studyId: "x" });
    for (const q of study.guide.sections.flatMap((s) => s.questions)) {
      for (const text of [q.text, q.textFemale].filter(Boolean) as string[]) {
        expect(checkUtterance(text, null), text).toEqual([]);
        expect(text).not.toContain("{topic}");
      }
    }
    expect(study.screener.length).toBeGreaterThan(0);
    expect(study.screener.every((s) => s.options.some((o) => o.qualifies))).toBe(true);
  });

  it.each([
    ["نبي نعرف ليش العملاء يتركون التطبيق", "churn_reasons"],
    ["نختبر السعر المناسب للوجبة العائلية", "price_test"],
    ["كيف استقبل الناس الصنف الجديد في المنيو", "new_item_test"],
    ["نقيس رضا زوار المطعم", "restaurant_satisfaction"],
  ])("picks a template for: %s", (objective, expected) => {
    expect(pickTemplate(objective)).toBe(expected);
  });

  it("asks women with the feminine wording", () => {
    const { guide } = fromTemplate("restaurant_satisfaction", "مطعم البيت");
    const engine = new InterviewEngine({
      guide: { ...guide, studyId: "x" },
      voiceGender: "female",
      participantGender: "female",
    });
    engine.start();
    expect(engine.respond({ text: "إيه" }).text).toContain("تختارين مطعم البيت");
  });
});

describe("generateStudy", () => {
  it("uses the template when no LLM is configured", async () => {
    const study = await generateStudy("نقيس رضا زوار المطعم");
    expect(study).toMatchObject({ source: "template", templateId: "restaurant_satisfaction" });
  });

  it("accepts an LLM draft but drops questions that fail the guardrails", async () => {
    const draft = {
      topic: "القهوة المختصة",
      sections: [
        {
          id: "a",
          title: "التجربة",
          questions: [
            { id: "q1", text: "وش يخليك تختار مقهى عن غيره؟" },
            { id: "q2", text: "أكيد عجبك المقهى صح؟" },
            { id: "q3", text: "كيف تكون زيارتك المعتادة؟" },
            { id: "q4", text: "وش اللي ممكن يخليك تزور أكثر؟" },
          ],
        },
      ],
    };
    const llm = new MockLlmProvider([`هذا الدليل:\n${JSON.stringify(draft)}`]);
    const study = await generateStudy("نفهم زوار المقاهي", { llm });
    expect(study.source).toBe("llm");
    expect(study.guide.sections[0]!.questions.map((q) => q.id)).toEqual(["q1", "q3", "q4"]);
  });

  it("falls back to a template on unusable LLM output", async () => {
    const study = await generateStudy("نختبر السعر", { llm: new MockLlmProvider(["ما عندي"]) });
    expect(study).toMatchObject({ source: "template", templateId: "price_test" });
  });
});
