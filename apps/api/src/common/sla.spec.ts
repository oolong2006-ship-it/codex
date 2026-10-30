import { isSlaBreached, slaMinutesRemaining } from './sla';

const base = {
  slaDueAt: new Date('2026-01-01T12:00:00Z'),
  status: 'OPEN',
  resolvedAt: null as Date | null,
};

describe('sla.isSlaBreached', () => {
  it('is breached when now is past the due time and the incident is still open', () => {
    expect(isSlaBreached(base, new Date('2026-01-01T12:00:01Z'))).toBe(true);
  });

  it('is NOT breached exactly at the due time (boundary)', () => {
    expect(isSlaBreached(base, new Date('2026-01-01T12:00:00Z'))).toBe(false);
  });

  it('is NOT breached before the due time', () => {
    expect(isSlaBreached(base, new Date('2026-01-01T11:59:59Z'))).toBe(false);
  });

  it('is never breached once resolved, even past due', () => {
    const resolved = { ...base, status: 'RESOLVED', resolvedAt: new Date('2026-01-01T11:30:00Z') };
    expect(isSlaBreached(resolved, new Date('2026-01-01T13:00:00Z'))).toBe(false);
  });

  it('is never breached once closed, even past due', () => {
    const closed = { ...base, status: 'CLOSED', resolvedAt: new Date('2026-01-01T11:30:00Z') };
    expect(isSlaBreached(closed, new Date('2026-01-01T13:00:00Z'))).toBe(false);
  });

  it('is not breached when there is no SLA due time', () => {
    expect(isSlaBreached({ ...base, slaDueAt: null }, new Date('2026-01-01T13:00:00Z'))).toBe(false);
  });
});

describe('sla.slaMinutesRemaining', () => {
  it('returns null when there is no due time', () => {
    expect(slaMinutesRemaining(null, new Date())).toBeNull();
  });

  it('returns positive minutes before the deadline', () => {
    expect(slaMinutesRemaining(new Date('2026-01-01T12:30:00Z'), new Date('2026-01-01T12:00:00Z'))).toBe(30);
  });

  it('returns negative minutes once overdue', () => {
    expect(slaMinutesRemaining(new Date('2026-01-01T12:00:00Z'), new Date('2026-01-01T12:45:00Z'))).toBe(-45);
  });
});
