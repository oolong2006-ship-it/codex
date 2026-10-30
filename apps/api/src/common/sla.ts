/**
 * Incident SLA helpers. Pure and dependency-free so they are trivially
 * unit-testable and shared between the incidents service and the dashboard.
 */

const TERMINAL_STATUSES = new Set(['RESOLVED', 'CLOSED']);

export interface SlaSubject {
  slaDueAt: Date | null;
  status: string;
  resolvedAt: Date | null;
}

/**
 * An incident is breached only when it is still open (not resolved/closed)
 * and the current time is strictly past its SLA due time. Exactly at the
 * due time is not yet a breach.
 */
export function isSlaBreached(incident: SlaSubject, now: Date): boolean {
  if (!incident.slaDueAt) return false;
  if (TERMINAL_STATUSES.has(incident.status)) return false;
  return now.getTime() > incident.slaDueAt.getTime();
}

/**
 * Signed whole minutes until the SLA deadline (negative once overdue),
 * or null when the incident carries no SLA due time.
 */
export function slaMinutesRemaining(slaDueAt: Date | null, now: Date): number | null {
  if (!slaDueAt) return null;
  return Math.round((slaDueAt.getTime() - now.getTime()) / 60000);
}
