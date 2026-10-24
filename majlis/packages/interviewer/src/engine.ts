import { createHash } from "node:crypto";
import {
  correctTranscript,
  detectDialect,
  loadLexicon,
  tokenize,
  type Dialect,
} from "@majlis/dialect";
import {
  answerDepth,
  asksIfHuman,
  classifyConsent,
  coverage,
  prefersNotToAnswer,
  type AnswerDepth,
} from "./classify.js";
import {
  MAX_FOLLOW_UPS_PER_SECTION,
  validateGuide,
  type InterviewGuide,
  type Question,
} from "./guide.js";
import {
  fill,
  loadPhrases,
  pick,
  type FollowUpKind,
  type Gender,
  type Phrases,
} from "./phrases.js";
import { SeededRandom } from "./rng.js";

export type EngineStage = "consent" | "guide" | "follow_up" | "ended";

export type TurnAction =
  | "disclose"
  | "clarify_consent"
  | "ask"
  | "follow_up"
  | "repair"
  | "offer_text"
  | "honest_identity"
  | "close"
  | "end_no_consent"
  | "noop";

export interface InterviewerTurn {
  action: TurnAction;
  stage: EngineStage;
  text: string;
  questionId?: string;
  sectionId?: string;
  followUpKind?: FollowUpKind;
  sensitive?: boolean;
}

export interface ParticipantInput {
  text: string;
  /** 0..1 from ASR; ignored for typed input. */
  asrConfidence?: number;
  channel?: "voice" | "text";
}

export interface ConsentRecord {
  grantedAt: string;
  disclosureText: string;
  disclosureVersion: number;
  disclosureSha256: string;
  utterance: string;
}

export type EngineEvent =
  | { type: "consent_recorded"; record: ConsentRecord }
  | { type: "consent_declined"; at: string }
  | { type: "dialect_detected"; dialect: Dialect | null; confidence: number }
  | { type: "text_mode_offered"; at: string }
  | { type: "question_declined"; questionId: string }
  | { type: "question_skipped_covered"; questionId: string; coverage: number };

export interface TranscriptEntry {
  role: "interviewer" | "participant";
  text: string;
  at: string;
  action?: TurnAction;
  questionId?: string;
}

export interface AnswerRecord {
  utterances: string[];
  declined: boolean;
  followUps: number;
}

export interface EngineOptions {
  guide: InterviewGuide;
  voiceGender: Gender;
  participantGender?: Gender;
  /** Fixed dialect from the study settings; otherwise detected from the first answers. */
  dialect?: Dialect;
  seed?: number;
  asrConfidenceThreshold?: number;
  coverThreshold?: number;
  now?: () => Date;
}

const MIN_WORDS_FOR_DIALECT = 3;

interface Position {
  section: number;
  question: number;
}

export interface EngineSnapshot {
  events: number;
  transcript: number;
  answers: Map<string, AnswerRecord>;
  consent: ConsentRecord | null;
  textModeOffered: boolean;
  stage: EngineStage;
  position: Position | null;
  asked: Set<string>;
  skipped: Set<string>;
  sectionFollowUps: Map<string, number>;
  sectionLastFollowUp: Map<string, FollowUpKind>;
  lastFollowUpText: string;
  consentClarifications: number;
  repairStreak: number;
  dialectLocked: boolean;
  dialect: Dialect | null;
  dialectLockedAt: number;
  interviewerTurns: number;
  guideUtterances: string[];
  lastBackchannel: string;
  rotation: number;
  random: number;
}

function replaceMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  for (const [k, v] of source) target.set(k, v);
}

function replaceSet<T>(target: Set<T>, source: Set<T>): void {
  target.clear();
  for (const v of source) target.add(v);
}

export class InterviewEngine {
  readonly events: EngineEvent[] = [];
  readonly transcript: TranscriptEntry[] = [];
  readonly answers = new Map<string, AnswerRecord>();
  consent: ConsentRecord | null = null;
  textModeOffered = false;

  private stageValue: EngineStage = "consent";
  private started = false;
  private position: Position | null = null;
  private readonly asked = new Set<string>();
  private readonly skipped = new Set<string>();
  private readonly sectionFollowUps = new Map<string, number>();
  private readonly sectionLastFollowUp = new Map<string, FollowUpKind>();
  private lastFollowUpText = "";
  private consentClarifications = 0;
  private repairStreak = 0;
  private dialectLocked: boolean;
  private dialectValue: Dialect | null;
  private dialectLockedAt = 0;
  private interviewerTurns = 0;
  private guideUtterances: string[] = [];
  private lastBackchannel = "";
  private rotation = 0;
  private readonly random: SeededRandom;
  private readonly phrases: Phrases;
  private readonly guide: InterviewGuide;
  private readonly opts: Required<
    Pick<EngineOptions, "asrConfidenceThreshold" | "coverThreshold">
  > &
    EngineOptions;

  constructor(options: EngineOptions) {
    this.guide = validateGuide(options.guide);
    this.opts = { asrConfidenceThreshold: 0.5, coverThreshold: 0.5, ...options };
    this.random = new SeededRandom(options.seed ?? 1);
    this.phrases = loadPhrases();
    this.dialectLocked = options.dialect !== undefined;
    this.dialectValue = options.dialect ?? null;
  }

  get stage(): EngineStage {
    return this.stageValue;
  }

  get dialect(): Dialect | null {
    return this.dialectValue;
  }

  /** The disclosure exactly as spoken; its hash goes into the consent record. */
  get disclosureText(): string {
    return fill(this.phrases.disclosure, {
      assistant: this.phrases.assistant[this.opts.voiceGender],
      duration: this.guide.durationPhrase ?? "عشر دقايق",
      topic: this.guide.topic,
    });
  }

  /**
   * Captures all mutable state so a planned turn can be taken back, e.g. when
   * the participant resumes speaking before the reply is heard.
   */
  snapshot(): EngineSnapshot {
    return structuredClone({
      events: this.events.length,
      transcript: this.transcript.length,
      answers: this.answers,
      consent: this.consent,
      textModeOffered: this.textModeOffered,
      stage: this.stageValue,
      position: this.position,
      asked: this.asked,
      skipped: this.skipped,
      sectionFollowUps: this.sectionFollowUps,
      sectionLastFollowUp: this.sectionLastFollowUp,
      lastFollowUpText: this.lastFollowUpText,
      consentClarifications: this.consentClarifications,
      repairStreak: this.repairStreak,
      dialectLocked: this.dialectLocked,
      dialect: this.dialectValue,
      dialectLockedAt: this.dialectLockedAt,
      interviewerTurns: this.interviewerTurns,
      guideUtterances: this.guideUtterances,
      lastBackchannel: this.lastBackchannel,
      rotation: this.rotation,
      random: this.random.state,
    });
  }

  restore(snap: EngineSnapshot): void {
    const s = structuredClone(snap);
    this.events.length = s.events;
    this.transcript.length = s.transcript;
    replaceMap(this.answers, s.answers);
    this.consent = s.consent;
    this.textModeOffered = s.textModeOffered;
    this.stageValue = s.stage;
    this.position = s.position;
    replaceSet(this.asked, s.asked);
    replaceSet(this.skipped, s.skipped);
    replaceMap(this.sectionFollowUps, s.sectionFollowUps);
    replaceMap(this.sectionLastFollowUp, s.sectionLastFollowUp);
    this.lastFollowUpText = s.lastFollowUpText;
    this.consentClarifications = s.consentClarifications;
    this.repairStreak = s.repairStreak;
    this.dialectLocked = s.dialectLocked;
    this.dialectValue = s.dialect;
    this.dialectLockedAt = s.dialectLockedAt;
    this.interviewerTurns = s.interviewerTurns;
    this.guideUtterances = s.guideUtterances;
    this.lastBackchannel = s.lastBackchannel;
    this.rotation = s.rotation;
    this.random.state = s.random;
  }

  start(): InterviewerTurn {
    if (this.started) throw new Error("interview already started");
    this.started = true;
    return this.say({ action: "disclose", stage: "consent", text: this.disclosureText });
  }

  respond(input: ParticipantInput): InterviewerTurn {
    if (!this.started) throw new Error("call start() first");
    if (this.stageValue === "ended") return { action: "noop", stage: "ended", text: "" };

    const raw = input.text.trim();
    this.transcript.push({
      role: "participant",
      text: raw,
      at: this.now(),
      ...(this.position ? { questionId: this.current()!.id } : {}),
    });

    const lowConfidence =
      input.channel !== "text" &&
      input.asrConfidence !== undefined &&
      input.asrConfidence < this.opts.asrConfidenceThreshold;
    if (!raw || lowConfidence) return this.repair();
    this.repairStreak = 0;

    const text = correctTranscript(raw);
    if (asksIfHuman(text)) return this.honestIdentity();
    if (this.stageValue === "consent") return this.handleConsent(text);
    return this.handleAnswer(text);
  }

  // ─── stages ────────────────────────────────────────────────────────────────

  private handleConsent(text: string): InterviewerTurn {
    const answer = classifyConsent(text);
    if (answer === "yes") {
      const disclosureText = this.disclosureText;
      this.consent = {
        grantedAt: this.now(),
        disclosureText,
        disclosureVersion: this.phrases.version,
        disclosureSha256: createHash("sha256").update(disclosureText).digest("hex"),
        utterance: text,
      };
      this.events.push({ type: "consent_recorded", record: this.consent });
      return this.advance(this.p(this.phrases.start));
    }
    if (answer === "no" || this.consentClarifications >= 2) {
      // Without explicit consent the interview does not start.
      this.events.push({ type: "consent_declined", at: this.now() });
      this.stageValue = "ended";
      return this.say({
        action: "end_no_consent",
        stage: "ended",
        text: this.p(this.phrases.no_consent),
      });
    }
    this.consentClarifications += 1;
    return this.say({
      action: "clarify_consent",
      stage: "consent",
      text: this.p(this.phrases.consent_clarify),
    });
  }

  private handleAnswer(text: string): InterviewerTurn {
    const question = this.current()!;
    const section = this.guide.sections[this.position!.section]!;
    const record = this.answers.get(question.id)!;

    if (prefersNotToAnswer(text)) {
      record.declined = true;
      this.events.push({ type: "question_declined", questionId: question.id });
      const ack = this.p(
        this.phrases.decline_ack[this.rotation++ % this.phrases.decline_ack.length]!,
      );
      return this.advance(ack);
    }

    record.utterances.push(text);
    this.guideUtterances.push(text);
    this.maybeDetectDialect();

    const depth = answerDepth(text, question.followUpPolicy?.minWords);
    const maxForQuestion = question.sensitive ? 0 : (question.followUpPolicy?.maxFollowUps ?? 2);
    const usedInSection = this.sectionFollowUps.get(section.id) ?? 0;
    if (
      depth !== "substantive" &&
      record.followUps < maxForQuestion &&
      usedInSection < MAX_FOLLOW_UPS_PER_SECTION
    ) {
      record.followUps += 1;
      this.sectionFollowUps.set(section.id, usedInSection + 1);
      return this.followUp(section.id, question, depth);
    }
    return this.advance(this.backchannel());
  }

  private followUp(sectionId: string, question: Question, depth: AnswerDepth): InterviewerTurn {
    const order: FollowUpKind[] =
      depth === "generic" ? ["why", "how", "example"] : ["example", "how", "why"];
    const last = this.sectionLastFollowUp.get(sectionId);
    const kind = order.find((k) => k !== last) ?? order[0]!;
    this.sectionLastFollowUp.set(sectionId, kind);
    const options = this.phrases.follow_ups[kind]
      .map((v) => this.p(v))
      .filter((t) => t !== this.lastFollowUpText);
    const text = options[Math.floor(this.random.next() * options.length)]!;
    this.lastFollowUpText = text;
    this.stageValue = "follow_up";
    return this.say({
      action: "follow_up",
      stage: "follow_up",
      text,
      questionId: question.id,
      sectionId,
      followUpKind: kind,
    });
  }

  /** Moves to the next unasked, not-yet-covered question, or closes the interview. */
  private advance(prefix: string): InterviewerTurn {
    const previousSection = this.position?.section;
    const next = this.nextPosition();
    if (!next) return this.close(prefix);

    this.position = next;
    const question = this.current()!;
    const section = this.guide.sections[next.section]!;
    this.asked.add(question.id);
    this.answers.set(question.id, { utterances: [], declined: false, followUps: 0 });
    this.stageValue = "guide";

    const transition =
      previousSection !== undefined && previousSection !== next.section
        ? this.p(
            this.phrases.section_transition[
              this.rotation++ % this.phrases.section_transition.length
            ]!,
          )
        : "";
    return this.say({
      action: "ask",
      stage: "guide",
      text: join(prefix, transition, this.questionText(question)),
      questionId: question.id,
      sectionId: section.id,
      sensitive: Boolean(question.sensitive),
    });
  }

  private nextPosition(): Position | null {
    const said = this.guideUtterances.join(" ");
    const start = this.position ?? { section: 0, question: -1 };
    for (let s = start.section; s < this.guide.sections.length; s++) {
      const questions = this.guide.sections[s]!.questions;
      for (let q = s === start.section ? start.question + 1 : 0; q < questions.length; q++) {
        const question = questions[q]!;
        if (this.asked.has(question.id) || this.skipped.has(question.id)) continue;
        const covered = coverage(said, question.coverKeywords ?? []);
        if (covered >= this.opts.coverThreshold) {
          this.skipped.add(question.id);
          this.events.push({
            type: "question_skipped_covered",
            questionId: question.id,
            coverage: covered,
          });
          continue;
        }
        return { section: s, question: q };
      }
    }
    return null;
  }

  private close(prefix: string): InterviewerTurn {
    this.stageValue = "ended";
    this.position = null;
    return this.say({
      action: "close",
      stage: "ended",
      text: join(prefix, this.p(this.phrases.closing), this.guide.incentive ?? ""),
    });
  }

  private repair(): InterviewerTurn {
    this.repairStreak += 1;
    if (this.repairStreak >= 2) {
      this.repairStreak = 0;
      this.textModeOffered = true;
      this.events.push({ type: "text_mode_offered", at: this.now() });
      return this.say({
        action: "offer_text",
        stage: this.stageValue,
        text: this.p(this.phrases.offer_text),
      });
    }
    return this.say({
      action: "repair",
      stage: this.stageValue,
      text: this.p(this.phrases.repair),
    });
  }

  private honestIdentity(): InterviewerTurn {
    const answer = fill(this.p(this.phrases.honest_identity), {
      assistant: this.phrases.assistant[this.opts.voiceGender],
    });
    const question = this.current();
    const resume =
      this.stageValue === "consent" || !question
        ? this.p(this.phrases.resume_consent)
        : fill(this.phrases.return_to_question, { question: this.questionText(question) });
    return this.say({
      action: "honest_identity",
      stage: this.stageValue,
      text: join(answer, resume),
      ...(question ? { questionId: question.id } : {}),
    });
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private questionText(q: Question): string {
    if (!q.sensitive) return q.text;
    return `${this.p(this.phrases.sensitive_prefix)}${q.text}${this.p(this.phrases.sensitive_suffix)}`;
  }

  /**
   * Detects the dialect from the first two informative answers; one-word replies
   * ("عادي"، "حلو") carry no dialect signal and are not counted.
   */
  private maybeDetectDialect(): void {
    if (this.dialectLocked) return;
    const informative = this.guideUtterances.filter(
      (u) => tokenize(u).length >= MIN_WORDS_FOR_DIALECT,
    );
    const result = detectDialect(informative);
    if (result.dialect || informative.length >= 2) {
      this.dialectLocked = true;
      this.dialectValue = result.dialect;
      this.dialectLockedAt = this.interviewerTurns;
      this.events.push({
        type: "dialect_detected",
        dialect: result.dialect,
        confidence: result.confidence,
      });
    }
  }

  /**
   * Short listening cue, never the same as the previous one. After a dialect is
   * detected, its own cues are blended in gradually rather than switched at once.
   */
  private backchannel(): string {
    let pool = this.phrases.backchannels;
    if (this.dialectValue) {
      const turnsSince = this.interviewerTurns - this.dialectLockedAt;
      const blend = Math.min(0.6, 0.2 * turnsSince);
      const own = loadLexicon().dialects[this.dialectValue].backchannels;
      if (own.length && this.random.next() < blend) pool = own;
    }
    const options = pool.filter((b) => b !== this.lastBackchannel);
    const choice = options[Math.floor(this.random.next() * options.length)]!;
    this.lastBackchannel = choice;
    return choice;
  }

  private current(): Question | null {
    if (!this.position) return null;
    return this.guide.sections[this.position.section]!.questions[this.position.question]!;
  }

  private p(value: Parameters<typeof pick>[0]): string {
    return pick(value, this.opts.participantGender);
  }

  private now(): string {
    return (this.opts.now?.() ?? new Date()).toISOString();
  }

  private say(turn: InterviewerTurn): InterviewerTurn {
    this.interviewerTurns += 1;
    this.transcript.push({
      role: "interviewer",
      text: turn.text,
      at: this.now(),
      action: turn.action,
      ...(turn.questionId ? { questionId: turn.questionId } : {}),
    });
    return turn;
  }
}

/** Joins spoken parts; a bare listening cue gets a comma before what follows. */
function join(...parts: string[]): string {
  const kept = parts.map((p) => p.trim()).filter(Boolean);
  return kept.map((p, i) => (i < kept.length - 1 && !/[.،,؟?!]$/.test(p) ? `${p}،` : p)).join(" ");
}
