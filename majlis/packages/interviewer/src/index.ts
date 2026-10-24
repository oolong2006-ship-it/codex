/** Interview stages in order (greeting and disclosure are spoken in the first turn). */
export const INTERVIEW_STAGES = [
  "greeting",
  "disclosure",
  "consent",
  "guide",
  "follow_up",
  "closing",
] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

export * from "./guide.js";
export * from "./engine.js";
export * from "./guardrails.js";
export * from "./classify.js";
export { buildSystemPrompt, buildRephraseInstruction, type PromptContext } from "./prompt.js";
export {
  loadPhrases,
  pick,
  type Gender,
  type Gendered,
  type FollowUpKind,
  type Phrases,
} from "./phrases.js";
export {
  Interviewer,
  REPHRASABLE,
  type SpokenTurn,
  type InterviewerOptions,
} from "./interviewer.js";
export {
  TEMPLATE_IDS,
  fromTemplate,
  generateStudy,
  pickTemplate,
  type TemplateId,
  type GeneratedStudy,
  type ScreenerQuestion,
  type ScreenerOption,
} from "./templates.js";
