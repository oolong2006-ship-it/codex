import { normalizeForSpeech } from "@majlis/dialect";
import type { LlmMessage, LlmProvider } from "@majlis/providers";
import {
  InterviewEngine,
  type EngineOptions,
  type InterviewerTurn,
  type ParticipantInput,
  type TurnAction,
} from "./engine.js";
import { checkUtterance, type Violation } from "./guardrails.js";
import { buildRephraseInstruction, buildSystemPrompt } from "./prompt.js";

/**
 * The engine decides *what* happens each turn; an optional LLM only rewords
 * the planned line to sound natural. Disclosure, consent, honesty and repair
 * lines are never reworded, and any LLM wording that fails a guardrail is
 * dropped in favour of the template.
 */
export const REPHRASABLE: readonly TurnAction[] = ["ask", "follow_up"];

export interface SpokenTurn extends InterviewerTurn {
  /** Text sent to TTS: numbers, currency and brand names in spoken Saudi form. */
  speech: string;
  source: "template" | "llm";
  /** Guardrail violations of rejected LLM wording, if any. */
  rejected?: Violation[];
}

export interface InterviewerOptions extends EngineOptions {
  llm?: LlmProvider;
  /** Recent transcript entries given to the LLM as context. */
  contextTurns?: number;
}

export class Interviewer {
  readonly engine: InterviewEngine;
  private readonly llm: LlmProvider | undefined;
  private readonly options: InterviewerOptions;

  constructor(options: InterviewerOptions) {
    this.options = options;
    this.engine = new InterviewEngine(options);
    this.llm = options.llm;
  }

  async start(): Promise<SpokenTurn> {
    return this.finish(this.engine.start());
  }

  async respond(input: ParticipantInput, signal?: AbortSignal): Promise<SpokenTurn> {
    const turn = this.engine.respond(input);
    if (!this.llm || !REPHRASABLE.includes(turn.action)) return this.finish(turn);
    return this.rephrase(turn, signal);
  }

  private async rephrase(turn: InterviewerTurn, signal?: AbortSignal): Promise<SpokenTurn> {
    const history: LlmMessage[] = this.engine.transcript
      .slice(-(this.options.contextTurns ?? 6) - 1, -1)
      .map((t) => ({ role: t.role === "interviewer" ? "assistant" : "user", content: t.text }));
    const messages: LlmMessage[] = [
      {
        role: "system",
        content: buildSystemPrompt({
          guide: this.options.guide,
          voiceGender: this.options.voiceGender,
          ...(this.options.participantGender
            ? { participantGender: this.options.participantGender }
            : {}),
          dialect: this.engine.dialect,
        }),
      },
      ...history,
      { role: "user", content: buildRephraseInstruction(turn.text) },
    ];

    let candidate = "";
    try {
      candidate = cleanup(
        await this.llm!.complete({ messages, maxTokens: 120, ...(signal ? { signal } : {}) }),
      );
    } catch {
      return this.finish(turn);
    }
    if (!candidate) return this.finish(turn);

    const violations = checkUtterance(candidate, this.engine.dialect);
    if (turn.action === "ask" && !/[؟?]/.test(candidate)) {
      violations.push({ kind: "multiple_questions", detail: "question lost in rewording" });
    }
    if (violations.length) return { ...this.finish(turn), rejected: violations };
    return this.finish({ ...turn, text: candidate }, "llm");
  }

  private finish(turn: InterviewerTurn, source: "template" | "llm" = "template"): SpokenTurn {
    const dialect = this.engine.dialect;
    return {
      ...turn,
      speech: turn.text ? normalizeForSpeech(turn.text, dialect ? { dialect } : {}) : "",
      source,
    };
  }
}

function cleanup(text: string): string {
  return text
    .trim()
    .replace(/^[«"“']+|[»"”']+$/g, "")
    .trim();
}
