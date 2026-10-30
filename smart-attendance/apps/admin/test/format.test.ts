import { describe, expect, it } from 'vitest';
import { addDaysIso, currentMonth, formatDateTime, formatMinutes, today } from '../lib/format';
import { labelOf, OUTCOME_LABELS } from '../lib/labels';

describe('formatting', () => {
  it('prints the wall clock of the tenant zone', () => {
    expect(formatDateTime('2026-10-26T19:00:00Z')).toBe('2026-10-26 22:00');
    expect(formatDateTime('2026-10-26T19:00:00Z', 'UTC')).toBe('2026-10-26 19:00');
  });

  it('handles missing and invalid values', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not a date')).toBe('—');
    expect(formatMinutes(null)).toBe('—');
    expect(formatMinutes(15)).toBe('15 د');
  });

  it('derives today and the current month in the tenant zone', () => {
    // 22:30 UTC on the 31st is already the 1st in Riyadh.
    expect(today('Asia/Riyadh', new Date('2026-10-31T22:30:00Z'))).toBe('2026-11-01');
    expect(currentMonth('Asia/Riyadh', new Date('2026-10-31T22:30:00Z'))).toBe('2026-11');
  });

  it('adds days across month boundaries', () => {
    expect(addDaysIso('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('labels', () => {
  it('covers every shift outcome in Arabic', () => {
    for (const key of ['PRESENT', 'LATE', 'EARLY_LEAVE', 'ABSENT', 'INCOMPLETE', 'NOT_DUE']) {
      expect(OUTCOME_LABELS[key]).toBeTruthy();
    }
    expect(labelOf(OUTCOME_LABELS, 'UNKNOWN')).toBe('UNKNOWN');
    expect(labelOf(OUTCOME_LABELS, null)).toBe('—');
  });
});
