import { scoreSentiment } from "./sentiment.js";
import {
  emptyCounts,
  type Answer,
  type Dimension,
  type Quote,
  type SentimentCounts,
} from "./types.js";

/** Segments the memory is organized by: single attributes and gender × age band. */
const SEGMENT_SHAPES: Dimension[][] = [
  ["gender"],
  ["ageBand"],
  ["city"],
  ["dialect"],
  ["gender", "ageBand"],
];

export interface PersonaAnswer extends Answer {
  themeTitle: string;
}

export interface Persona {
  segmentKey: string;
  segment: Partial<Record<Dimension, string>>;
  attributes: {
    sessions: number;
    studies: number;
    answers: number;
    sentiment: SentimentCounts;
    /** Themes this segment speaks about most positively / negatively. */
    praises: { theme: string; count: number }[];
    complaints: { theme: string; count: number }[];
  };
  evidence: Quote[];
}

export function segmentKey(segment: Partial<Record<Dimension, string>>): string {
  return Object.entries(segment)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

/**
 * Builds the accumulated consumer memory for an organization. A segment becomes
 * a persona only with enough distinct interviews behind it.
 */
export function buildPersonas(
  answers: PersonaAnswer[],
  options: { minSessions?: number; redact?: (s: string) => string } = {},
): Persona[] {
  const minSessions = options.minSessions ?? 3;
  const redact = options.redact ?? ((s) => s);
  const groups = new Map<
    string,
    { segment: Partial<Record<Dimension, string>>; items: PersonaAnswer[] }
  >();

  for (const a of answers) {
    for (const shape of SEGMENT_SHAPES) {
      const values = shape.map((d) => a.participant[d]);
      if (values.some((v) => !v)) continue;
      const segment = Object.fromEntries(shape.map((d, i) => [d, values[i]!]));
      const key = segmentKey(segment);
      const g = groups.get(key) ?? { segment, items: [] as PersonaAnswer[] };
      g.items.push(a);
      groups.set(key, g);
    }
  }

  const personas: Persona[] = [];
  for (const [key, { segment, items }] of groups) {
    const sessions = new Set(items.map((i) => i.sessionId));
    if (sessions.size < minSessions) continue;
    const sentiment = emptyCounts();
    const praise = new Map<string, number>();
    const complaint = new Map<string, number>();
    const scored = items.map((item) => ({ item, s: scoreSentiment(item.text) }));
    for (const { item, s } of scored) {
      sentiment[s.label]++;
      if (s.label === "positive")
        praise.set(item.themeTitle, (praise.get(item.themeTitle) ?? 0) + 1);
      if (s.label === "negative")
        complaint.set(item.themeTitle, (complaint.get(item.themeTitle) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) =>
      [...m]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([theme, count]) => ({ theme, count }));
    const evidence = scored
      .filter(({ s, item }) => s.label !== "neutral" && item.text.split(/\s+/).length >= 4)
      .sort((a, b) => b.s.positive + b.s.negative - (a.s.positive + a.s.negative))
      .filter((x, i, arr) => arr.findIndex((y) => y.item.sessionId === x.item.sessionId) === i)
      .slice(0, 3)
      .map(({ item, s }) => ({ turnId: item.turnId, text: redact(item.text), sentiment: s.label }));
    personas.push({
      segmentKey: key,
      segment,
      attributes: {
        sessions: sessions.size,
        studies: new Set(items.map((i) => i.studyId)).size,
        answers: items.length,
        sentiment,
        praises: top(praise),
        complaints: top(complaint),
      },
      evidence,
    });
  }
  return personas.sort((a, b) => b.attributes.sessions - a.attributes.sessions);
}
