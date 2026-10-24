import { containsPhrase, normalizeForMatch, tokenize } from "@majlis/dialect";

/** Rule-based intent classification of a participant utterance (text-first baseline). */

const n = (phrases: string[]) => phrases.map(normalizeForMatch);

const CONSENT_YES = n([
  "ايه",
  "اي",
  "ايوه",
  "نعم",
  "اكيد",
  "يلا",
  "يالله",
  "تمام",
  "ابشر",
  "نبدا",
  "موافق",
  "موافقه",
  "طيب",
  "اوكي",
  "ok",
  "okay",
  "yes",
  "يب",
  "زين",
  "حياك",
  "ماشي",
  "من عيوني",
]);
const CONSENT_YES_PHRASES = n(["لا باس", "ليش لا", "ما عندي مانع", "ما فيه مانع", "مافي مانع"]);
const CONSENT_NO = n([
  "لا",
  "لاء",
  "لا شكرا",
  "مو الحين",
  "مب الحين",
  "ما ابي",
  "ما ابغى",
  "مو موافق",
  "مو موافقه",
  "مشغول",
  "مشغوله",
  "وقت ثاني",
  "بعدين",
  "no",
]);

const PREFER_NOT = n([
  "افضل ما اجاوب",
  "افضل ما ارد",
  "ما ودي اجاوب",
  "ما ابي اجاوب",
  "ما ابغى اجاوب",
  "ما احب اجاوب",
  "تجاوز",
  "تجاوزه",
  "نتجاوزه",
  "السؤال اللي بعده",
  "اسمح لي ما اجاوب",
  "خلنا نتجاوزه",
  "pass",
  "skip",
]);

const ASKS_HUMAN = n([
  "انت انسان",
  "انتي انسانه",
  "انت بشر",
  "انتي بشر",
  "انت حقيقي",
  "انتي حقيقيه",
  "انت روبوت",
  "انتي روبوت",
  "انت اله",
  "انتي اله",
  "انت ذكاء اصطناعي",
  "انتي ذكاء اصطناعي",
  "اكلم انسان",
  "اكلم اله",
  "اكلم روبوت",
  "اكلم بشر",
  "هل انت انسان",
  "are you human",
  "are you a bot",
  "are you real",
  "is this a bot",
]);

const GENERIC = n([
  "عادي",
  "حلو",
  "زين",
  "كويس",
  "تمام",
  "ما ادري",
  "مدري",
  "مادري",
  "يعني",
  "اوكي",
  "ok",
  "مو بطال",
  "مب بطال",
  "حلو مره",
  "زين مره",
  "ممتاز",
  "سيء",
  "مو حلو",
  "نفس الشي",
  "ما عندي شي",
]);

function hasAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => containsPhrase(text, p));
}

export type ConsentAnswer = "yes" | "no" | "unclear";

export function classifyConsent(utterance: string): ConsentAnswer {
  const text = normalizeForMatch(utterance);
  if (!text) return "unclear";
  if (hasAny(text, CONSENT_YES_PHRASES)) return "yes";
  const no = hasAny(text, CONSENT_NO);
  const yes = hasAny(text, CONSENT_YES);
  // "لا، يلا نبدأ" is rare; a plain "لا" anywhere wins to avoid assuming consent.
  if (no) return "no";
  return yes ? "yes" : "unclear";
}

export function prefersNotToAnswer(utterance: string): boolean {
  return hasAny(normalizeForMatch(utterance), PREFER_NOT);
}

export function asksIfHuman(utterance: string): boolean {
  return hasAny(normalizeForMatch(utterance), ASKS_HUMAN);
}

export type AnswerDepth = "substantive" | "short" | "generic";

export function answerDepth(utterance: string, minWords = 4): AnswerDepth {
  const text = normalizeForMatch(utterance);
  if (GENERIC.includes(text)) return "generic";
  if (tokenize(utterance).length < minWords) return "short";
  return "substantive";
}

/** Share of a question's cover keywords that already appeared in the participant's answers. */
export function coverage(answers: string, keywords: readonly string[]): number {
  if (keywords.length === 0) return 0;
  const text = normalizeForMatch(answers);
  const hits = keywords.filter((k) => containsPhrase(text, normalizeForMatch(k)));
  return hits.length / keywords.length;
}
