import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  InterviewEngine,
  MAX_FOLLOW_UPS_PER_SECTION,
  checkUtterance,
  loadPhrases,
  type InterviewerTurn,
  type TurnAction,
} from "../src/index.js";
import { restaurantGuide } from "./fixtures.js";

interface Scenario {
  name: string;
  options: {
    voiceGender: "male" | "female";
    participantGender?: "male" | "female";
  };
  turns: {
    participant: string;
    asrConfidence?: number;
    channel?: "voice" | "text";
    expect: {
      action: TurnAction;
      questionId?: string;
      followUpKind?: string;
      contains?: string;
      notContains?: string;
    };
  }[];
  final: {
    stage?: string;
    consent?: boolean;
    declined?: string[];
    skipped?: string[];
    asked?: string[];
    dialect?: string;
    textModeOffered?: boolean;
  };
}

const dir = new URL("./golden/", import.meta.url);
const scenarios = readdirSync(dir)
  .filter((f) => f.endsWith(".yaml"))
  .sort()
  .map((f) => [f, parse(readFileSync(new URL(f, dir), "utf8")) as Scenario] as const);

const backchannels = new Set(loadPhrases().backchannels);

/** Invariants that must hold in every conversation, whatever the scenario. */
function assertInvariants(engine: InterviewEngine, turns: InterviewerTurn[]) {
  const [first, ...rest] = turns;
  expect(first!.action).toBe("disclose");
  expect(first!.text).toMatch(/مساعدة? ذكية?/);
  expect(first!.text).toContain("مجلس");

  const consentAt = engine.events.findIndex((e) => e.type === "consent_recorded");
  const asked: string[] = [];
  const followUpsBySection = new Map<string, number>();
  let previousCue = "";

  for (const [i, turn] of turns.entries()) {
    expect(checkUtterance(turn.text, engine.dialect), `turn ${i}: ${turn.text}`).toEqual([]);

    if (turn.action === "ask") {
      expect(consentAt, "asked before consent").toBeGreaterThanOrEqual(0);
      expect(asked, `question ${turn.questionId} asked twice`).not.toContain(turn.questionId);
      asked.push(turn.questionId!);
      if (turn.sensitive) expect(turn.text).toMatch(/اختياري|تفضّل/);
    }
    if (turn.action === "follow_up") {
      const n = (followUpsBySection.get(turn.sectionId!) ?? 0) + 1;
      followUpsBySection.set(turn.sectionId!, n);
      expect(n).toBeLessThanOrEqual(MAX_FOLLOW_UPS_PER_SECTION);
    }

    const cue = turn.text.split("،")[0]!.trim();
    if (backchannels.has(cue)) {
      expect(cue, `same listening cue twice in a row at turn ${i}`).not.toBe(previousCue);
      previousCue = cue;
    }
  }

  // A declined question never gets a follow-up.
  for (const event of engine.events) {
    if (event.type !== "question_declined") continue;
    const idx = rest.findIndex(
      (t) => t.questionId === event.questionId && t.action === "follow_up",
    );
    expect(idx).toBe(-1);
  }
}

describe.each(scenarios)("golden: %s", (_file, scenario) => {
  it(scenario.name, () => {
    const engine = new InterviewEngine({
      guide: restaurantGuide,
      ...scenario.options,
      seed: 42,
      now: () => new Date("2026-10-24T09:00:00Z"),
    });
    const turns = [engine.start()];
    for (const [i, step] of scenario.turns.entries()) {
      const turn = engine.respond({
        text: step.participant,
        ...(step.asrConfidence !== undefined ? { asrConfidence: step.asrConfidence } : {}),
        ...(step.channel ? { channel: step.channel } : {}),
      });
      const where = `step ${i} ("${step.participant}") → ${turn.action}: ${turn.text}`;
      expect(turn.action, where).toBe(step.expect.action);
      if (step.expect.questionId) expect(turn.questionId, where).toBe(step.expect.questionId);
      if (step.expect.followUpKind) expect(turn.followUpKind, where).toBe(step.expect.followUpKind);
      if (step.expect.contains) expect(turn.text, where).toContain(step.expect.contains);
      if (step.expect.notContains) expect(turn.text, where).not.toContain(step.expect.notContains);
      if (turn.action !== "noop") turns.push(turn);
    }

    assertInvariants(engine, turns);

    const f = scenario.final;
    if (f.stage) expect(engine.stage).toBe(f.stage);
    if (f.consent !== undefined) expect(engine.consent !== null).toBe(f.consent);
    if (f.textModeOffered !== undefined) expect(engine.textModeOffered).toBe(f.textModeOffered);
    if (f.dialect) expect(engine.dialect).toBe(f.dialect);
    const declined = engine.events.flatMap((e) =>
      e.type === "question_declined" ? [e.questionId] : [],
    );
    const skipped = engine.events.flatMap((e) =>
      e.type === "question_skipped_covered" ? [e.questionId] : [],
    );
    if (f.declined) expect(declined).toEqual(f.declined);
    if (f.skipped) expect(skipped).toEqual(f.skipped);
    if (f.asked)
      expect(turns.filter((t) => t.action === "ask").map((t) => t.questionId)).toEqual(f.asked);
  });
});
