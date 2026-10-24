import type { Dialect } from "./dialects.js";
import { loadLexicon, type Lexicon } from "./lexicon.js";
import { spokenHour, spokenNumber } from "./numbers.js";

/**
 * ar_sa_normalizer: rewrites text the way a Saudi would say it, before it is sent
 * to TTS. Numbers, currency, percentages, times, dates and brand names.
 */

export interface NormalizeOptions {
  dialect?: Dialect;
  /** Replace Latin brand names with their Saudi pronunciation (default true). */
  brands?: boolean;
}

const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const NUM = String.raw`\d{1,3}(?:[,٬]\d{3})+|\d+`;
const CURRENCY_WORDS = String.raw`ريالاً|ريالا|ريالات|ريال|ر\.س|رس|SAR|SR|﷼`;

function toInt(raw: string): number {
  return Number(raw.replace(/[,٬]/g, ""));
}

function money(intPart: number, fraction: string | undefined, dialect?: Dialect): string {
  let base: string;
  if (intPart === 0) base = "";
  else if (intPart === 1) base = "ريال واحد";
  else if (intPart === 2) base = "ريالين";
  else base = `${spokenNumber(intPart, dialect)} ريال`;

  if (!fraction) return base || "صفر ريال";
  const halalas = Math.round(Number(`0.${fraction}`) * 100);
  if (halalas === 0) return base || "صفر ريال";
  const tail =
    halalas === 50
      ? "نص"
      : halalas === 25
        ? "ربع"
        : `${spokenNumber(halalas, dialect)} ${halalas <= 10 && halalas > 2 ? "هللات" : "هللة"}`;
  if (!base) return halalas === 50 ? "نص ريال" : halalas === 25 ? "ربع ريال" : tail;
  return `${base} و${tail}`;
}

function clock(hour24: number, minute: number, marker: string | undefined, dialect?: Dialect) {
  let period = "";
  const m = marker?.toLowerCase();
  let h = hour24;
  if (m === "م" || m === "pm" || m === "مساء" || m === "مساءً") h = h < 12 ? h + 12 : h;
  if (m === "ص" || m === "am" || m === "صباحا" || m === "صباحاً") h = h === 12 ? 0 : h;
  if (marker || hour24 >= 13 || hour24 === 0) {
    if (h < 5) period = "بالليل";
    else if (h < 12) period = "الصبح";
    else if (h < 15) period = "الظهر";
    else if (h < 18) period = "العصر";
    else period = "بالليل";
  }

  let hour12 = h % 12 || 12;
  let phrase: string;
  if (minute === 0) phrase = spokenHour(hour12, dialect);
  else if (minute === 15) phrase = `${spokenHour(hour12, dialect)} وربع`;
  else if (minute === 20) phrase = `${spokenHour(hour12, dialect)} وثلث`;
  else if (minute === 30) phrase = `${spokenHour(hour12, dialect)} ونص`;
  else if (minute === 40 || minute === 45) {
    hour12 = (hour12 % 12) + 1;
    phrase = `${spokenHour(hour12, dialect)} إلا ${minute === 45 ? "ربع" : "ثلث"}`;
  } else {
    phrase = `${spokenHour(hour12, dialect)} و${spokenNumber(minute, dialect)} دقيقة`;
  }
  return period ? `${phrase} ${period}` : phrase;
}

function date(day: number, month: number, year: number | undefined, dialect?: Dialect) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parts = [spokenNumber(day, dialect), MONTHS[month - 1]!];
  if (year) parts.push(spokenNumber(year, dialect));
  return parts.join(" ");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeForSpeech(
  input: string,
  options: NormalizeOptions = {},
  lexicon: Lexicon = loadLexicon(),
): string {
  const { dialect } = options;
  let text = input.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

  if (options.brands !== false) {
    const brands = [...lexicon.common.brands].sort((a, b) => b.match.length - a.match.length);
    for (const { match, say } of brands) {
      text = text.replace(new RegExp(`(?<![A-Za-z])${escapeRegExp(match)}(?![A-Za-z])`, "gi"), say);
    }
  }

  // ISO dates 2026-10-24 and day/month/year 24/10/2026.
  text = text.replace(
    /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g,
    (all, y, m, d) => date(Number(d), Number(m), Number(y), dialect) ?? all,
  );
  text = text.replace(
    /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g,
    (all, d, m, y) => date(Number(d), Number(m), y ? Number(y) : undefined, dialect) ?? all,
  );

  // Times 9:30, 21:15, 9:30 م
  text = text.replace(
    /\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(ص|م|صباحاً|صباحا|مساءً|مساء|am|pm|AM|PM)(?![\p{L}]))?/gu,
    (_all, h, m, marker) => clock(Number(h), Number(m), marker, dialect),
  );

  // Currency: "25 ريال", "25.50 ر.س", "SAR 25", "﷼25"
  text = text.replace(
    new RegExp(String.raw`(${NUM})(?:\.(\d{1,2}))?\s*(?:${CURRENCY_WORDS})(?![\p{L}])`, "gu"),
    (_all, i, f) => money(toInt(i), f, dialect),
  );
  text = text.replace(
    new RegExp(String.raw`(?:SAR|SR|﷼)\s*(${NUM})(?:\.(\d{1,2}))?`, "gu"),
    (_all, i, f) => money(toInt(i), f, dialect),
  );

  // Percentages
  text = text.replace(
    new RegExp(String.raw`(${NUM})(?:\.(\d+))?\s*(?:%|٪)`, "gu"),
    (_all, i, f) =>
      `${spokenNumber(toInt(i), dialect)}${f ? ` فاصلة ${spokenNumber(Number(f), dialect)}` : ""} بالمية`,
  );

  // Remaining numbers: long or zero-led sequences are read digit by digit.
  text = text.replace(new RegExp(String.raw`(${NUM})(?:\.(\d+))?`, "gu"), (all, i, f) => {
    const digits = i.replace(/[,٬]/g, "");
    if ((digits.length > 1 && digits.startsWith("0")) || digits.length > 9) {
      return [...digits].map((d: string) => spokenNumber(Number(d), dialect)).join(" ");
    }
    const whole = spokenNumber(Number(digits), dialect);
    return f ? `${whole} فاصلة ${spokenNumber(Number(f), dialect)}` : whole;
  });

  return text.replace(/\s+/g, " ").trim();
}
