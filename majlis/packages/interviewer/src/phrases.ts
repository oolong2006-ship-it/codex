import { readFileSync } from "node:fs";
import { parse } from "yaml";

export type Gender = "male" | "female";
export type Gendered = string | { m?: string; f?: string; n: string };

export interface Phrases {
  version: number;
  assistant: Record<Gender, string>;
  disclosure: string;
  consent_clarify: Gendered;
  no_consent: Gendered;
  start: Gendered;
  honest_identity: Gendered;
  return_to_question: string;
  resume_consent: Gendered;
  repair: Gendered;
  offer_text: Gendered;
  decline_ack: Gendered[];
  sensitive_prefix: Gendered;
  sensitive_suffix: Gendered;
  section_transition: Gendered[];
  follow_ups: Record<FollowUpKind, Gendered[]>;
  backchannels: string[];
  closing: Gendered;
}

export type FollowUpKind = "why" | "how" | "example";

const PHRASES_FILE = new URL("../phrases/ar-SA.yaml", import.meta.url);
let cached: Phrases | undefined;

export function loadPhrases(): Phrases {
  cached ??= parse(readFileSync(PHRASES_FILE, "utf8")) as Phrases;
  return cached;
}

/** Picks the participant-gendered variant; unknown gender gets the neutral form. */
export function pick(value: Gendered, participant: Gender | undefined): string {
  if (typeof value === "string") return value;
  if (participant === "male" && value.m) return value.m;
  if (participant === "female" && value.f) return value.f;
  return value.n;
}

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}
