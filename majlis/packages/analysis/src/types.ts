import type { Sentiment } from "./sentiment.js";

export const DIMENSIONS = ["gender", "ageBand", "city", "dialect"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type ParticipantAttributes = Partial<Record<Dimension, string | null>>;

/** One participant answer as loaded for analysis. */
export interface Answer {
  turnId: string;
  sessionId: string;
  studyId: string;
  questionId: string | null;
  text: string;
  participant: ParticipantAttributes;
}

export interface Quote {
  turnId: string;
  text: string;
  sentiment: Sentiment;
}

export type SentimentCounts = Record<Sentiment, number>;

export const emptyCounts = (): SentimentCounts => ({
  positive: 0,
  negative: 0,
  neutral: 0,
  mixed: 0,
});
