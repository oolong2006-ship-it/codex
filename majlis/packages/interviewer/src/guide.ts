/** Study interview guide, as authored by the client (or generated from a one-line goal). */

export interface FollowUpPolicy {
  /** Follow-ups allowed on this question (0–2). Sensitive questions never get follow-ups. */
  maxFollowUps?: 0 | 1 | 2;
  /** Answers shorter than this many words count as short. */
  minWords?: number;
}

export interface Question {
  id: string;
  text: string;
  sensitive?: boolean;
  followUpPolicy?: FollowUpPolicy;
  /**
   * Words that show this question was already answered implicitly. When a
   * participant's earlier answers contain enough of them, the question is skipped.
   */
  coverKeywords?: string[];
}

export interface GuideSection {
  id: string;
  title: string;
  questions: Question[];
}

export interface InterviewGuide {
  studyId: string;
  /** Spoken topic in the disclosure, e.g. "المطعم". */
  topic: string;
  /** Spoken duration, e.g. "عشر دقايق". */
  durationPhrase?: string;
  /** Incentive line read at the end, e.g. "الحافز بيوصلك خلال يومين." */
  incentive?: string;
  sections: GuideSection[];
}

export const MAX_FOLLOW_UPS_PER_SECTION = 2;

export class GuideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideError";
  }
}

export function validateGuide(guide: InterviewGuide): InterviewGuide {
  if (!guide.topic.trim()) throw new GuideError("guide.topic is required");
  if (guide.sections.length === 0) throw new GuideError("guide needs at least one section");
  const ids = new Set<string>();
  for (const section of guide.sections) {
    if (section.questions.length === 0) {
      throw new GuideError(`section ${section.id} has no questions`);
    }
    for (const q of section.questions) {
      if (ids.has(q.id)) throw new GuideError(`duplicate question id ${q.id}`);
      ids.add(q.id);
      if (!q.text.trim()) throw new GuideError(`question ${q.id} has no text`);
      const max = q.followUpPolicy?.maxFollowUps;
      if (max !== undefined && (max < 0 || max > 2)) {
        throw new GuideError(`question ${q.id}: maxFollowUps must be 0–2`);
      }
    }
  }
  return guide;
}
