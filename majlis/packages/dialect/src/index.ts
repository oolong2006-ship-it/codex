export { DIALECTS, isDialect, type Dialect } from "./dialects.js";
export { normalizeForMatch, tokenize, containsPhrase } from "./text.js";
export {
  loadLexicon,
  avoidListFor,
  type Lexicon,
  type DialectLexicon,
  type CommonLexicon,
} from "./lexicon.js";
export { detectDialect, type DetectionResult, type DetectOptions } from "./detect.js";
export {
  checkDialectText,
  dialectCorrectness,
  correctTranscript,
  type DialectIssue,
} from "./check.js";
export { spokenNumber, spokenHour } from "./numbers.js";
export { normalizeForSpeech, type NormalizeOptions } from "./normalizer.js";
