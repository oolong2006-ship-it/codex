import { normalizeForMatch, tokenize } from "@majlis/dialect";

/**
 * Word edit distance between a reference (the reviewer's correction) and a
 * hypothesis (what ASR produced), after the same normalization voice-lab uses.
 */
export function wordErrors(
  reference: string,
  hypothesis: string,
): { errors: number; words: number } {
  const ref = tokenize(reference);
  const hyp = tokenize(hypothesis);
  const prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= hyp.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return { errors: prev[hyp.length]!, words: ref.length };
}

export type QaKind = "too_short" | "repeated" | "automated";

export interface QaInput {
  turnId: string;
  sessionId: string;
  text: string;
  action?: string | null;
}

export interface QaIssue {
  turnId: string;
  kind: QaKind;
  detail: string;
}

/** Short acknowledgements that are normal replies, not low-quality answers. */
const ACKS = new Set(
  ["ايه", "اي", "ايوه", "نعم", "لا", "اوكي", "ok", "تمام", "طيب", "يلا", "زين"].map(
    normalizeForMatch,
  ),
);

/**
 * Flags answers worth a human look. Answers to the consent prompt are skipped.
 * - too_short: one-word answers that are not plain acknowledgements;
 * - repeated: the same answer given twice in one interview;
 * - automated: an identical long answer appearing in several interviews.
 */
export function detectQaIssues(
  answers: QaInput[],
  options: { automatedMinWords?: number } = {},
): QaIssue[] {
  const issues: QaIssue[] = [];
  const perSession = new Map<string, Map<string, string>>();
  const across = new Map<string, { sessions: Set<string>; turnIds: string[] }>();
  const minWords = options.automatedMinWords ?? 6;

  for (const a of answers) {
    const norm = normalizeForMatch(a.text);
    const words = norm ? norm.split(" ").length : 0;
    if (words === 1 && !ACKS.has(norm)) {
      issues.push({ turnId: a.turnId, kind: "too_short", detail: `words=${words}` });
    }
    const seen = perSession.get(a.sessionId) ?? new Map<string, string>();
    if (words >= 2 && seen.has(norm)) {
      issues.push({ turnId: a.turnId, kind: "repeated", detail: `same as ${seen.get(norm)}` });
    }
    if (!seen.has(norm)) seen.set(norm, a.turnId);
    perSession.set(a.sessionId, seen);
    if (words >= minWords) {
      const entry = across.get(norm) ?? { sessions: new Set<string>(), turnIds: [] };
      entry.sessions.add(a.sessionId);
      entry.turnIds.push(a.turnId);
      across.set(norm, entry);
    }
  }
  for (const { sessions, turnIds } of across.values()) {
    if (sessions.size < 2) continue;
    for (const turnId of turnIds) {
      issues.push({
        turnId,
        kind: "automated",
        detail: `identical answer in ${sessions.size} interviews`,
      });
    }
  }
  return issues;
}
