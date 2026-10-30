/** تسميات عربية للحالات والأحكام المعروضة في الواجهة. */

export const OUTCOME_LABELS: Record<string, string> = {
  PRESENT: 'في الوقت',
  LATE: 'متأخر',
  EARLY_LEAVE: 'خروج مبكر',
  ABSENT: 'غائب',
  INCOMPLETE: 'غير مكتمل',
  NOT_DUE: 'لم يحن موعده',
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  OPEN: 'مفتوحة',
  CLOSED: 'مغلقة',
  INCOMPLETE: 'غير مكتملة',
};

export const DECISION_LABELS: Record<string, string> = {
  VERIFIED: 'مقبولة',
  PENDING_REVIEW: 'بانتظار المراجعة',
  REJECTED: 'مرفوضة',
};

export const EXCEPTION_STATUS_LABELS: Record<string, string> = {
  OPEN: 'مفتوح',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

export const EXCEPTION_KIND_LABELS: Record<string, string> = {
  DECISION_OVERRIDE: 'تصحيح قرار',
  MISSING_PUNCH: 'بصمة منسية',
};

export const PERIOD_STATUS_LABELS: Record<string, string> = {
  OPEN: 'مفتوحة',
  LOCKED: 'مقفلة',
  EXPORTED: 'مُصدَّرة',
};

export const PUNCH_TYPE_LABELS: Record<string, string> = {
  CLOCK_IN: 'حضور',
  CLOCK_OUT: 'انصراف',
};

export const CHANGE_REASON_LABELS: Record<string, string> = {
  LOST: 'فقد الجهاز',
  STOLEN: 'سرقة',
  BROKEN: 'تعطل',
  UPGRADE: 'ترقية',
};

export function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—';
  return map[key] ?? key;
}

/** أيام الأسبوع بمعيار ISO (1 الاثنين … 7 الأحد). */
export const DAY_LABELS: Record<number, string> = {
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
  7: 'الأحد',
};
