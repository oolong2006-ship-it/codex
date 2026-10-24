import {
  checkDialectText,
  containsPhrase,
  normalizeForMatch,
  tokenize,
  type Dialect,
} from "@majlis/dialect";

/**
 * Checks on anything the interviewer is about to say. Template phrases must
 * pass them, and any LLM-generated wording that fails is replaced by the template.
 */

export type ViolationKind =
  | "claims_human"
  | "leading_question"
  | "judgmental"
  | "academic_jargon"
  | "dialect"
  | "too_long"
  | "multiple_questions";

export interface Violation {
  kind: ViolationKind;
  detail: string;
}

const n = (phrases: string[]) => phrases.map(normalizeForMatch);

const CLAIMS_HUMAN = n([
  "انا انسان",
  "انا انسانه",
  "انا بشر",
  "انا شخص حقيقي",
  "انا موظف",
  "انا موظفه",
  "انا حقيقي",
  "انا حقيقيه",
  "انا مو روبوت",
  "انا مو اله",
  "انا مو ذكاء اصطناعي",
  "انا مو مساعد ذكي",
  "انا مو مساعده ذكيه",
  "لست اله",
  "لست روبوت",
  "لست ذكاء اصطناعي",
  "i am human",
  "i'm human",
  "i am a real person",
]);

const LEADING = n([
  "اكيد عجبك",
  "اكيد انك",
  "اكيد ان",
  "طبعا عجبك",
  "اليس",
  "اليست",
  "مو صح ان",
  "ما تتفق",
  "ما تتفقين",
  "ما تشوف ان",
  "ما تشوفين ان",
  "ما تحس ان",
  "ما تحسين ان",
  "اتفق معي",
  "لا شك ان",
  "عجبك صح",
  "عجبتك صح",
  "صح ولا لا",
]);

const JUDGMENTAL = n([
  "غلطان",
  "غلطانه",
  "كلامك غلط",
  "رايك غلط",
  "مو منطقي",
  "غير منطقي",
  "هذا غريب",
  "رايك غريب",
  "عيب",
  "مبالغ",
  "ما اتفق معك",
  "هذا مو صحيح",
  "معقوله تقول",
]);

const ACADEMIC = n([
  "تجربه المستخدم",
  "رحله العميل",
  "القيمه المدركه",
  "الولاء للعلامه التجاريه",
  "مؤشرات الاداء",
  "المتغيرات",
  "المنهجيه",
  "صافي نقاط الترويج",
  "الشريحه المستهدفه",
  "سلوك المستهلك",
]);

const MAX_WORDS = 40;

export function checkUtterance(text: string, dialect: Dialect | null): Violation[] {
  const normalized = normalizeForMatch(text);
  const found: Violation[] = [];
  const scan = (kind: ViolationKind, list: string[]) => {
    for (const phrase of list) {
      if (containsPhrase(normalized, phrase)) found.push({ kind, detail: phrase });
    }
  };
  scan("claims_human", CLAIMS_HUMAN);
  scan("leading_question", LEADING);
  scan("judgmental", JUDGMENTAL);
  scan("academic_jargon", ACADEMIC);
  // A trailing "صح؟" turns a statement into a leading confirmation.
  if (/(?:^|\s)صح\s*[؟?]\s*$/u.test(text.trim()) && tokenize(text).length > 1) {
    found.push({ kind: "leading_question", detail: "صح؟" });
  }
  for (const issue of checkDialectText(text, dialect ?? "najdi")) {
    found.push({ kind: "dialect", detail: issue.phrase });
  }
  if (tokenize(text).length > MAX_WORDS) {
    found.push({ kind: "too_long", detail: `${tokenize(text).length} words` });
  }
  if ((text.match(/[؟?]/g) ?? []).length > 1) {
    found.push({ kind: "multiple_questions", detail: "more than one question" });
  }
  return found;
}
