import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { DIALECTS, type Dialect } from "./dialects.js";
import { normalizeForMatch } from "./text.js";

export interface Marker {
  w: string;
  weight: number;
}

export interface AvoidEntry {
  phrase: string;
  reason: string;
}

export interface DialectLexicon {
  dialect: Dialect;
  name: string;
  status: string;
  markers: Marker[];
  vocabulary: { word: string; msa: string }[];
  greetings: string[];
  closings: string[];
  backchannels: string[];
  avoid: AvoidEntry[];
  allow: string[];
}

export interface CommonLexicon {
  avoid: AvoidEntry[];
  brands: { match: string; say: string }[];
  asr_corrections: { from: string; to: string }[];
}

export interface Lexicon {
  common: CommonLexicon;
  dialects: Record<Dialect, DialectLexicon>;
}

// Works from both src/ and dist/, which sit one level below the package root.
const LEXICON_DIR = new URL("../lexicon/", import.meta.url);

function readYaml<T>(file: string): T {
  return parse(readFileSync(new URL(file, LEXICON_DIR), "utf8")) as T;
}

function validateDialect(raw: Partial<DialectLexicon>, expected: Dialect): DialectLexicon {
  if (raw.dialect !== expected) {
    throw new Error(`lexicon/${expected}.yaml declares dialect "${raw.dialect}"`);
  }
  for (const m of raw.markers ?? []) {
    if (!m.w || !(m.weight > 0 && m.weight <= 3)) {
      throw new Error(`lexicon/${expected}.yaml: invalid marker ${JSON.stringify(m)}`);
    }
  }
  return {
    dialect: expected,
    name: raw.name ?? expected,
    status: raw.status ?? "draft",
    markers: raw.markers ?? [],
    vocabulary: raw.vocabulary ?? [],
    greetings: raw.greetings ?? [],
    closings: raw.closings ?? [],
    backchannels: raw.backchannels ?? [],
    avoid: raw.avoid ?? [],
    allow: raw.allow ?? [],
  };
}

let cached: Lexicon | undefined;

export function loadLexicon(): Lexicon {
  if (cached) return cached;
  const common = readYaml<Partial<CommonLexicon>>("common.yaml");
  const dialects = Object.fromEntries(
    DIALECTS.map((d) => [d, validateDialect(readYaml<Partial<DialectLexicon>>(`${d}.yaml`), d)]),
  ) as Record<Dialect, DialectLexicon>;
  cached = {
    common: {
      avoid: common.avoid ?? [],
      brands: common.brands ?? [],
      asr_corrections: common.asr_corrections ?? [],
    },
    dialects,
  };
  return cached;
}

/** Avoid list in effect for a dialect: common + dialect-specific, minus what it allows. */
export function avoidListFor(dialect: Dialect, lexicon: Lexicon = loadLexicon()): AvoidEntry[] {
  const own = lexicon.dialects[dialect];
  const allowed = new Set(own.allow.map(normalizeForMatch));
  return [...lexicon.common.avoid, ...own.avoid].filter(
    (a) => !allowed.has(normalizeForMatch(a.phrase)),
  );
}
