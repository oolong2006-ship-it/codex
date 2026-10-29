/**
 * جلسات الحضور المشتقة (phase-2 §3، specs §F): تُبنى من البصمات المقبولة والتسويات،
 * ويمكن إعادة بنائها في أي وقت. دوال نقية لا تعرف قاعدة البيانات.
 */
export type SessionStatus = 'OPEN' | 'CLOSED' | 'INCOMPLETE';

export interface SessionPunch {
  /** مرجع ثابت: event:<id> أو adjustment:<id>. */
  ref: string;
  type: 'CLOCK_IN' | 'CLOCK_OUT';
  at: Date;
}

export interface DerivedSession {
  status: SessionStatus;
  startRef: string;
  endRef: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number | null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * يقترن كل انصراف بالحضور المفتوح قبله.
 * - حضور آخر قبل انصراف: جلسة مغلقة بمدتها.
 * - حضور متكرر قبل أن يُغلق: الأول INCOMPLETE (لا انصراف له).
 * - انصراف بلا حضور مفتوح: لا يكوّن جلسة.
 * - جلسة أطول من الحد: INCOMPLETE، ولا تُحسب لها مدة.
 * - جلسة مفتوحة وما زالت ضمن الحد: OPEN.
 */
export function pairSessions(punches: readonly SessionPunch[], now: Date, maxSessionHours: number): DerivedSession[] {
  const maxMs = maxSessionHours * HOUR_MS;
  const sorted = [...punches].sort((a, b) => a.at.getTime() - b.at.getTime());
  const out: DerivedSession[] = [];
  let open: SessionPunch | null = null;

  const incomplete = (start: SessionPunch): DerivedSession => ({
    status: 'INCOMPLETE',
    startRef: start.ref,
    endRef: null,
    startedAt: start.at,
    endedAt: null,
    durationMinutes: null,
  });

  for (const punch of sorted) {
    if (punch.type === 'CLOCK_IN') {
      if (open) out.push(incomplete(open));
      open = punch;
      continue;
    }
    if (!open) continue;
    const span = punch.at.getTime() - open.at.getTime();
    out.push(
      span > maxMs
        ? incomplete(open)
        : {
            status: 'CLOSED',
            startRef: open.ref,
            endRef: punch.ref,
            startedAt: open.at,
            endedAt: punch.at,
            durationMinutes: Math.round(span / MINUTE_MS),
          },
    );
    open = null;
  }

  if (open) {
    const elapsed = now.getTime() - open.at.getTime();
    out.push(
      elapsed > maxMs
        ? incomplete(open)
        : { status: 'OPEN', startRef: open.ref, endRef: null, startedAt: open.at, endedAt: null, durationMinutes: null },
    );
  }
  return out;
}

/** التاريخ التشغيلي (YYYY-MM-DD) للحظة في منطقة العميل الزمنية. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
