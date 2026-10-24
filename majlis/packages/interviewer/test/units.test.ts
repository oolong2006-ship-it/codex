import { MockLlmProvider } from "@majlis/providers";
import { describe, expect, it } from "vitest";
import {
  GuideError,
  InterviewEngine,
  Interviewer,
  answerDepth,
  asksIfHuman,
  buildSystemPrompt,
  checkUtterance,
  classifyConsent,
  loadPhrases,
  pick,
  prefersNotToAnswer,
  validateGuide,
  type Gendered,
} from "../src/index.js";
import { restaurantGuide } from "./fixtures.js";

const allPhrases = (): string[] => {
  const p = loadPhrases();
  const values: Gendered[] = [
    p.consent_clarify,
    p.no_consent,
    p.start,
    p.honest_identity,
    p.repair,
    p.offer_text,
    p.closing,
    p.resume_consent,
    ...p.decline_ack,
    ...p.section_transition,
    ...Object.values(p.follow_ups).flat(),
  ];
  const out = values.flatMap((v) =>
    (["male", "female", undefined] as const).map((g) => pick(v, g)),
  );
  return [...out, ...p.backchannels, p.disclosure];
};

describe("templates", () => {
  it("every phrase passes the guardrails", () => {
    for (const phrase of allPhrases()) expect(checkUtterance(phrase, null), phrase).toEqual([]);
  });

  it("disclosure matches the approved wording and is spoken first", () => {
    const engine = new InterviewEngine({ guide: restaurantGuide, voiceGender: "male" });
    expect(engine.start().text).toBe(
      "هلا والله، معك مساعد ذكي من منصة مجلس، بنسولف عشر دقايق عن تجربتك مع المطعم، وكلامك سري ويهمنا. نبدأ؟",
    );
  });
});

describe("guardrails", () => {
  it.each([
    ["أنا إنسان مثلك، لا تشيل هم", "claims_human"],
    ["لا لا، أنا موظف في الشركة", "claims_human"],
    ["أكيد عجبك المنتج صح؟", "leading_question"],
    ["الأكل كان لذيذ، صح؟", "leading_question"],
    ["ما تشوف إن السعر مناسب؟", "leading_question"],
    ["رأيك غريب شوي", "judgmental"],
    ["كيف كانت رحلة العميل عندك؟", "academic_jargon"],
    ["سوف نبدأ الآن", "dialect"],
    ["وش رأيك بالسعر؟ وكيف الخدمة؟", "multiple_questions"],
  ])("flags: %s", (text, kind) => {
    expect(checkUtterance(text, "najdi").map((v) => v.kind)).toContain(kind);
  });

  it("accepts natural, neutral questions", () => {
    expect(checkUtterance("إيه، فاهم عليك. وش اللي عجبك أكثر؟", "najdi")).toEqual([]);
    expect(checkUtterance("لا، أنا مساعد ذكي مو إنسان، نكمل؟", "najdi")).toEqual([]);
  });
});

describe("classification", () => {
  it.each([
    ["إيه يلا", "yes"],
    ["لا بأس نبدأ", "yes"],
    ["ما عندي مانع", "yes"],
    ["لا شكراً", "no"],
    ["مو الحين", "no"],
    ["مين معي؟", "unclear"],
  ])("consent %s → %s", (text, expected) => {
    expect(classifyConsent(text)).toBe(expected);
  });

  it("recognises declines and identity questions without false positives", () => {
    expect(prefersNotToAnswer("أفضّل ما أجاوب")).toBe(true);
    expect(prefersNotToAnswer("ما ودي أجاوب على هالسؤال")).toBe(true);
    expect(prefersNotToAnswer("خلهم يحسنون الخدمة")).toBe(false);
    expect(asksIfHuman("إنتي إنسانة ولا آلة؟")).toBe(true);
    expect(asksIfHuman("الموظف كان إنسان محترم")).toBe(false);
  });

  it("grades answer depth", () => {
    expect(answerDepth("عادي")).toBe("generic");
    expect(answerDepth("كان سريع")).toBe("short");
    expect(answerDepth("كان سريع والأكل حار والموظف محترم")).toBe("substantive");
  });
});

describe("engine", () => {
  it("records consent with the disclosure text and its hash", () => {
    const engine = new InterviewEngine({
      guide: restaurantGuide,
      voiceGender: "female",
      now: () => new Date("2026-10-24T09:00:00Z"),
    });
    engine.start();
    engine.respond({ text: "إيه" });
    expect(engine.consent).toMatchObject({
      grantedAt: "2026-10-24T09:00:00.000Z",
      disclosureText: engine.disclosureText,
      disclosureVersion: 1,
      utterance: "إيه",
    });
    expect(engine.consent!.disclosureSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never follows up on sensitive questions", () => {
    const guide = {
      ...restaurantGuide,
      sections: [
        { id: "s", title: "s", questions: [{ id: "x", text: "كم دخلك؟", sensitive: true }] },
      ],
    };
    const engine = new InterviewEngine({ guide, voiceGender: "male" });
    engine.start();
    engine.respond({ text: "إيه" });
    expect(engine.respond({ text: "عادي" }).action).toBe("close");
  });

  it("is reproducible for a given seed", () => {
    const run = () => {
      const e = new InterviewEngine({ guide: restaurantGuide, voiceGender: "male", seed: 7 });
      return [e.start(), e.respond({ text: "إيه" }), e.respond({ text: "عادي" })].map(
        (t) => t.text,
      );
    };
    expect(run()).toEqual(run());
  });

  it("rejects invalid guides", () => {
    expect(() => validateGuide({ ...restaurantGuide, sections: [] })).toThrow(GuideError);
    const dup = {
      ...restaurantGuide,
      sections: [
        {
          id: "a",
          title: "a",
          questions: [
            { id: "q", text: "س" },
            { id: "q", text: "ص" },
          ],
        },
      ],
    };
    expect(() => validateGuide(dup)).toThrow(/duplicate/);
  });
});

describe("system prompt", () => {
  it("carries the honesty rule, the guide and the dialect guidance", () => {
    const prompt = buildSystemPrompt({
      guide: restaurantGuide,
      voiceGender: "female",
      participantGender: "female",
      dialect: "hijazi",
    });
    expect(prompt).toContain("مساعدة ذكية");
    expect(prompt).toContain("لا تدّعِ أبداً أنك إنسان");
    expect(prompt).toContain("الحجازية");
    expect(prompt).toContain("دحين");
    expect(prompt).toContain("تقريباً وين يقع دخل الأسرة بالشهر؟ (حساس)");
    expect(prompt).toContain("صيغة المؤنث");
    expect(prompt).toContain("خمسة وعشرين ريال");
  });
});

describe("Interviewer with an LLM", () => {
  const start = async (llm?: MockLlmProvider) => {
    const interviewer = new Interviewer({
      guide: restaurantGuide,
      voiceGender: "male",
      seed: 3,
      ...(llm ? { llm } : {}),
    });
    await interviewer.start();
    return interviewer;
  };

  it("uses natural LLM wording when it passes the guardrails", async () => {
    const interviewer = await start(
      new MockLlmProvider(["حيّاك، خلنا نبدأ: ليش اخترت هالمطعم آخر مرة؟"]),
    );
    const turn = await interviewer.respond({ text: "إيه" });
    expect(turn.source).toBe("llm");
    expect(turn.text).toContain("ليش اخترت");
  });

  it("falls back to the template when the LLM claims to be human or leads", async () => {
    const human = await start(new MockLlmProvider(["أنا إنسان مثلك، وش اللي خلاك تختاره؟"]));
    const t1 = await human.respond({ text: "إيه" });
    expect(t1.source).toBe("template");
    expect(t1.rejected?.map((v) => v.kind)).toContain("claims_human");

    const leading = await start(new MockLlmProvider(["أكيد عجبك المطعم صح؟"]));
    const t2 = await leading.respond({ text: "إيه" });
    expect(t2.source).toBe("template");
    expect(t2.text).toContain("وش اللي خلاك تختار هالمطعم");
  });

  it("never rewords disclosure or identity answers", async () => {
    const llm = new MockLlmProvider(["كلام ثاني"]);
    const interviewer = await start(llm);
    const turn = await interviewer.respond({ text: "إنت إنسان؟" });
    expect(turn.action).toBe("honest_identity");
    expect(turn.source).toBe("template");
  });

  it("produces speech text with spoken numbers", async () => {
    const guide = {
      ...restaurantGuide,
      sections: [
        { id: "s", title: "s", questions: [{ id: "x", text: "لو صار السعر 25 ريال، تطلبه؟" }] },
      ],
    };
    const interviewer = new Interviewer({ guide, voiceGender: "male" });
    await interviewer.start();
    const turn = await interviewer.respond({ text: "إيه" });
    expect(turn.speech).toContain("خمسة وعشرين ريال");
    expect(turn.text).toContain("25 ريال");
  });
});

describe("naturalness regressions", () => {
  it("does not stack a listening cue on a cue-like transition", () => {
    for (const t of loadPhrases().section_transition) {
      const first = pick(t, undefined).split(/[،\s]/)[0]!;
      expect(loadPhrases().backchannels).not.toContain(first);
    }
  });

  it("ignores one-word replies when detecting the dialect", () => {
    const engine = new InterviewEngine({ guide: restaurantGuide, voiceGender: "male", seed: 5 });
    engine.start();
    for (const text of ["إيه", "عادي", "حلو", "قريب من البيت وأكلهم نظيف"])
      engine.respond({ text });
    expect(engine.dialect).toBeNull();
    engine.respond({ text: "ايش أقولك، دحين صار التوصيل أبطأ من قبل" });
    expect(engine.dialect).toBe("hijazi");
  });
});
