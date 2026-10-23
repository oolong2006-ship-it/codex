/** "HH:mm" local shift times; overnight shifts allowed (endTime <= startTime). */
export interface ShiftDef {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
}

export interface AttendanceCalc {
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'INCOMPLETE';
}

const MS_MIN = 60_000;
const MS_DAY = 86_400_000;
/** Minimum extra minutes before overtime is counted. */
export const OVERTIME_THRESHOLD_MINUTES = 15;

export function parseTimeHHmm(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) throw new Error(`Invalid time (expected HH:mm): ${t}`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59) throw new Error(`Invalid time: ${t}`);
  return h * 60 + mi;
}

/** Scheduled shift length in minutes (gross, including break). Overnight aware. */
export function shiftLengthMinutes(shift: ShiftDef): number {
  const s = parseTimeHHmm(shift.startTime);
  let e = parseTimeHHmm(shift.endTime);
  if (e <= s) e += 1440;
  return e - s;
}

/**
 * Attendance metrics for one shift. Shift times are local (timezone offset in
 * minutes, default +180 = Riyadh). The shift instance is chosen as the one
 * (previous / same / next local day) whose start is closest to the check-in.
 */
export function calculateAttendance(
  shift: ShiftDef,
  checkIn: Date | null,
  checkOut: Date | null,
  timezoneOffsetMinutes: number = 180,
): AttendanceCalc {
  if (!checkIn) {
    return { workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'ABSENT' };
  }
  const offsetMs = timezoneOffsetMinutes * MS_MIN;
  const startMin = parseTimeHHmm(shift.startTime);
  const length = shiftLengthMinutes(shift);
  const breakMin = Math.max(0, shift.breakMinutes || 0);
  const grace = Math.max(0, shift.graceMinutes || 0);

  // Local "wall clock" ms of check-in, and the local midnight of that day.
  const inLocal = checkIn.getTime() + offsetMs;
  const localMidnight = Math.floor(inLocal / MS_DAY) * MS_DAY;
  let shiftStartLocal = localMidnight + startMin * MS_MIN;
  let best = Infinity;
  for (const k of [-1, 0, 1]) {
    const cand = localMidnight + k * MS_DAY + startMin * MS_MIN;
    const dist = Math.abs(inLocal - cand);
    if (dist < best) {
      best = dist;
      shiftStartLocal = cand;
    }
  }
  const shiftStart = shiftStartLocal - offsetMs; // back to UTC instant
  const shiftEnd = shiftStart + length * MS_MIN;

  const diffIn = Math.round((checkIn.getTime() - shiftStart) / MS_MIN);
  const lateMinutes = diffIn > grace ? diffIn - grace : 0;

  if (!checkOut || checkOut.getTime() <= checkIn.getTime()) {
    return { workedMinutes: 0, lateMinutes, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: 'INCOMPLETE' };
  }
  const raw = Math.round((checkOut.getTime() - checkIn.getTime()) / MS_MIN);
  const workedMinutes = Math.max(0, raw - breakMin);
  const earlyLeaveMinutes = Math.max(0, Math.round((shiftEnd - checkOut.getTime()) / MS_MIN));
  const scheduledNet = Math.max(0, length - breakMin);
  const extra = workedMinutes - scheduledNet;
  const overtimeMinutes = extra >= OVERTIME_THRESHOLD_MINUTES ? extra : 0;
  return {
    workedMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
  };
}

/** Great-circle distance in meters (mean Earth radius 6,371,008.8 m). */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinGeofence(
  point: { lat: number; lng: number },
  center: { lat: number; lng: number },
  radiusMeters: number,
): boolean {
  return haversineMeters(point, center) <= radiusMeters;
}
