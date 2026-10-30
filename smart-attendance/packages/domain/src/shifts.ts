/**
 * الورديات (phase-2 §4): قوالب ثابتة بأيام وتوقيت محلي، والوردية العابرة لمنتصف الليل
 * تنتهي في اليوم التالي. دوال نقية؛ التوقيت المحلي يُحوَّل بمنطقة العميل.
 */
import type { SessionStatus } from './sessions';

export interface ShiftTemplate {
  startTime: string; // HH:MM محلي
  endTime: string; // HH:MM محلي
  days: readonly number[]; // ISO: 1 الاثنين … 7 الأحد
}

export interface ShiftAssignmentWindow {
  validFrom: string; // YYYY-MM-DD
  validTo: string | null;
}

export interface Occurrence {
  date: string; // التاريخ التشغيلي لبداية الوردية
  start: Date;
  end: Date;
}

export interface SessionFact {
  businessDate: string;
  startedAt: Date;
  endedAt: Date | null;
  status: SessionStatus;
}

export type ShiftOutcome = 'PRESENT' | 'LATE' | 'EARLY_LEAVE' | 'ABSENT' | 'INCOMPLETE' | 'NOT_DUE';

export interface OccurrenceResult {
  date: string;
  start: Date;
  end: Date;
  outcome: ShiftOutcome;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  startedAt: Date | null;
  endedAt: Date | null;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** يوم الأسبوع بمعيار ISO (1 الاثنين … 7 الأحد). */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** فرق التوقيت (ms) لمنطقة زمنية عند لحظة معينة. */
function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const wallClockAsUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return wallClockAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** يحوّل تاريخًا ووقتًا محليين في منطقة معينة إلى لحظة UTC. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const first = naive - offsetMs(new Date(naive), timeZone);
  return new Date(naive - offsetMs(new Date(first), timeZone));
}

/** تواريخ بدء الوردية ضمن المدى وصلاحية التعيين، مع توقيتها الفعلي. */
export function shiftOccurrences(
  template: ShiftTemplate,
  window: ShiftAssignmentWindow,
  from: string,
  to: string,
  timeZone: string,
): Occurrence[] {
  const first = window.validFrom > from ? window.validFrom : from;
  const last = window.validTo !== null && window.validTo < to ? window.validTo : to;
  const out: Occurrence[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (!template.days.includes(isoWeekday(date))) continue;
    const start = zonedTimeToUtc(date, template.startTime, timeZone);
    // الوردية العابرة لمنتصف الليل تنتهي في التاريخ التالي.
    const endDate = template.endTime <= template.startTime ? addDays(date, 1) : date;
    out.push({ date, start, end: zonedTimeToUtc(endDate, template.endTime, timeZone) });
  }
  return out;
}

function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MINUTE_MS);
}

/**
 * حكم يوم واحد من الوردية (phase-2 §4). التأخر والخروج المبكر يُحسبان بعد السماح،
 * وتُحسب الدقائق من موعد الوردية نفسه. الجلسة غير المكتملة تُعد INCOMPLETE.
 */
export function evaluateOccurrence(
  occurrence: Occurrence,
  sessions: readonly SessionFact[],
  now: Date,
  grace: { lateMinutes: number; earlyLeaveMinutes: number },
): OccurrenceResult {
  const base = { date: occurrence.date, start: occurrence.start, end: occurrence.end };
  const session = sessions
    .filter((s) => s.businessDate === occurrence.date)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0];

  if (!session) {
    const due = occurrence.end.getTime() <= now.getTime();
    return { ...base, outcome: due ? 'ABSENT' : 'NOT_DUE', lateMinutes: 0, earlyLeaveMinutes: 0, startedAt: null, endedAt: null };
  }

  const lateDelta = minutesBetween(occurrence.start, session.startedAt);
  const lateMinutes = lateDelta > grace.lateMinutes ? lateDelta : 0;

  let earlyLeaveMinutes = 0;
  if (session.endedAt) {
    const earlyDelta = minutesBetween(session.endedAt, occurrence.end);
    earlyLeaveMinutes = earlyDelta > grace.earlyLeaveMinutes ? earlyDelta : 0;
  }

  let outcome: ShiftOutcome = 'PRESENT';
  if (session.status === 'INCOMPLETE' || (!session.endedAt && occurrence.end.getTime() <= now.getTime())) outcome = 'INCOMPLETE';
  else if (lateMinutes > 0) outcome = 'LATE';
  else if (earlyLeaveMinutes > 0) outcome = 'EARLY_LEAVE';

  return { ...base, outcome, lateMinutes, earlyLeaveMinutes, startedAt: session.startedAt, endedAt: session.endedAt };
}

export const SHIFT_DAY_MS = DAY_MS;

/** وقت محلي للعرض والتصدير بصيغة YYYY-MM-DD HH:MM في منطقة العميل. */
export function formatLocalDateTime(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}
