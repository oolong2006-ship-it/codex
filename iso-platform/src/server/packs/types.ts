export type AnswerValue = string | number | boolean | string[];
export type Answers = Record<string, AnswerValue | undefined>;

export interface Choice {
  value: string;
  ar: string;
  en: string;
}

export interface Question {
  id: string;
  section: "PROFILE" | "OPERATIONS" | "SECTOR" | "SYSTEM";
  type: "text" | "number" | "boolean" | "single" | "multi";
  ar: string;
  en: string;
  helpAr?: string;
  choices?: Choice[];
  /** Critical facts gate the blueprint: they must be answered and not conflicted. */
  critical?: boolean;
  optional?: boolean;
  min?: number;
  max?: number;
  when?: (a: Answers) => boolean;
}

export interface ProcessTemplate {
  code: string;
  ar: string;
  en: string;
  category: "MANAGEMENT" | "CORE" | "SUPPORT";
  ownerAr: string;
  inputsAr: string[];
  outputsAr: string[];
  kpisAr: string[];
  /** Short original description of how the process typically runs; used by document writer. */
  stepsAr: string[];
  when?: (a: Answers) => boolean;
  rationaleAr: string;
}

export interface RiskHypothesis {
  processCode: string;
  kind: "RISK" | "OPPORTUNITY";
  ar: string;
  descAr: string;
  likelihood: number;
  impact: number;
  treatmentAr: string;
}

export interface RegulatorHint {
  country: string;
  nameAr: string;
  topicAr: string;
}

export interface IndustryPack {
  code: string;
  ar: string;
  en: string;
  descriptionAr: string;
  questions: Question[];
  processes: ProcessTemplate[];
  risks: RiskHypothesis[];
  /** Possible regulators — hypotheses only; each needs source + verification date before use. */
  regulatorsToVerify: RegulatorHint[];
  /** Schemes that are separate management-system standards and must not be merged into the QMS pack. */
  separateSchemesAr: string[];
  forcesDesign?: boolean;
}

export interface ConflictRule {
  id: string;
  level: "CONFLICT" | "WARNING";
  questionIds: string[];
  test: (a: Answers, industry: string) => boolean;
  ar: string;
}
