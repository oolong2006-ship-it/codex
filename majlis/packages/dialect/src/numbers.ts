import type { Dialect } from "./dialects.js";

/**
 * Spoken Saudi number words (not written MSA): "خمسة وعشرين" rather than
 * "خمسة وعشرون", "مية" rather than "مائة". Teens follow the dialect because
 * they differ the most ("خمسطعش" in Najd and the Gulf, "خمستاشر" in Hijaz).
 */

const UNITS = ["", "واحد", "اثنين", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
/** Short forms used before "آلاف"/"ملايين" and for clock hours. */
const SHORT = ["", "وحدة", "ثنتين", "ثلاث", "أربع", "خمس", "ست", "سبع", "ثمان", "تسع", "عشر"];
const TENS = ["", "عشرة", "عشرين", "ثلاثين", "أربعين", "خمسين", "ستين", "سبعين", "ثمانين", "تسعين"];
const HUNDREDS = [
  "",
  "مية",
  "ميتين",
  "ثلاثمية",
  "أربعمية",
  "خمسمية",
  "ستمية",
  "سبعمية",
  "ثمنمية",
  "تسعمية",
];

const TEENS: Record<"gulf" | "hijazi" | "msa", string[]> = {
  gulf: ["احدعش", "اثنعش", "ثلطعش", "أربعطعش", "خمسطعش", "سطعش", "سبعطعش", "ثمنطعش", "تسعطعش"],
  hijazi: [
    "حداشر",
    "اطناشر",
    "تلتاشر",
    "اربعتاشر",
    "خمستاشر",
    "ستاشر",
    "سبعتاشر",
    "تمنتاشر",
    "تسعتاشر",
  ],
  msa: [
    "أحد عشر",
    "اثنا عشر",
    "ثلاثة عشر",
    "أربعة عشر",
    "خمسة عشر",
    "ستة عشر",
    "سبعة عشر",
    "ثمانية عشر",
    "تسعة عشر",
  ],
};

function teensFor(dialect: Dialect | undefined): string[] {
  if (dialect === "hijazi") return TEENS.hijazi;
  if (dialect === "msa_simple") return TEENS.msa;
  return TEENS.gulf;
}

function below100(n: number, dialect: Dialect | undefined): string {
  if (n < 10) return UNITS[n]!;
  if (n === 10) return "عشرة";
  if (n < 20) return teensFor(dialect)[n - 11]!;
  const unit = n % 10;
  const tens = TENS[Math.floor(n / 10)]!;
  return unit ? `${UNITS[unit]} و${tens}` : tens;
}

function below1000(n: number, dialect: Dialect | undefined): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (h) parts.push(HUNDREDS[h]!);
  if (rest) parts.push(below100(rest, dialect));
  return parts.join(" و");
}

function scale(count: number, one: string, two: string, plural: string, dialect?: Dialect) {
  if (count === 1) return one;
  if (count === 2) return two;
  if (count <= 10) return `${SHORT[count]} ${plural}`;
  return `${spokenNumber(count, dialect)} ${one}`;
}

/** Non-negative integers up to the billions in spoken Saudi form. */
export function spokenNumber(n: number, dialect?: Dialect): string {
  if (!Number.isInteger(n)) throw new Error(`spokenNumber expects an integer, got ${n}`);
  if (n < 0) return `سالب ${spokenNumber(-n, dialect)}`;
  if (n === 0) return "صفر";
  const groups: [number, string, string, string][] = [
    [1_000_000_000, "مليار", "مليارين", "مليارات"],
    [1_000_000, "مليون", "مليونين", "ملايين"],
    [1_000, "ألف", "ألفين", "آلاف"],
  ];
  const parts: string[] = [];
  let rest = n;
  for (const [size, one, two, plural] of groups) {
    const count = Math.floor(rest / size);
    if (count) parts.push(scale(count, one, two, plural, dialect));
    rest %= size;
  }
  if (rest) parts.push(below1000(rest, dialect));
  return parts.join(" و");
}

/** Clock hours use the short feminine forms: "الساعة ثنتين"، "الساعة خمس". */
export function spokenHour(hour12: number, dialect?: Dialect): string {
  if (hour12 >= 1 && hour12 <= 10) return SHORT[hour12]!;
  return teensFor(dialect)[hour12 - 11]!;
}
