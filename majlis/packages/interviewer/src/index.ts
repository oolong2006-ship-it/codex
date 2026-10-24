/** Interview stages in order. The state machine itself arrives in phase 2. */
export const INTERVIEW_STAGES = [
  "greeting",
  "disclosure",
  "consent",
  "guide",
  "follow_up",
  "closing",
] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];
