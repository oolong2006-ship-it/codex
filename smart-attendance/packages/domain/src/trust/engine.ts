/**
 * Attendance Trust Engine — دوال نقية تطبق specs §A و§B و§H حرفيًا.
 * الترتيب: الطبقة 1 (قاطعة) ← الطبقة 2 (الموقع) ← الطبقة 3 (الخطر) ← رفع Wi-Fi المقيد.
 */
import type { ReasonCode } from '../reason-codes';
import { haversineMeters, isValidCoordinate } from './geo';
import type {
  AssuranceLevel,
  CandidateSite,
  Decision,
  LocationSample,
  NextAction,
  TrustInput,
  TrustPolicy,
  TrustResult,
} from './types';

export const ENGINE_VERSION = 'trust-engine/1.0.0';

/**
 * القيم الافتراضية للسياسة: §A/§B من specs، وجدول الوضعيات من trust-accuracy §6 (ADR-0005).
 * تُنسخ إلى policy_versions عند إنشاء العميل؛ المحرك يقرأ السياسة الممرّرة فقط.
 */
export const DEFAULT_TRUST_POLICY: TrustPolicy = {
  assurance: {
    STANDARD: { max_accuracy_m: 100, max_sample_age_s: 30 },
    HIGH: { max_accuracy_m: 50, max_sample_age_s: 20 },
    STRICT: { max_accuracy_m: 30, max_sample_age_s: 15 },
  },
  future_sample_margin_s: 5,
  max_clock_skew_s: 300,
  impossible_speed_kmh: 250,
  recent_rebind_days: 7,
  sample_inconsistency_margin_m: 50,
  implausible_accuracy_ratio: 0.1,
  weights: {
    RISK_LOCATION_ACCESSORY: 1,
    RISK_WIFI_UNKNOWN_AT_SITE: 1,
    RISK_ACCURACY_IMPLAUSIBLE: 2,
    RISK_HIGH_DEVICE_ACTIVITY: 2,
    RISK_SAMPLE_INCONSISTENT: 3,
    RISK_REMOTE_CONTROL_APP: 3,
    RISK_BOOT_UNVERIFIED: 3,
    RISK_APP_ATTEST_KEY_CHURN: 0,
    SUP_WIFI_KNOWN: 1,
    SUP_PROVIDER_GNSS: 1,
  },
  pending_threshold: { STANDARD: 3, HIGH: 2, STRICT: 1 },
  reject_on: [],
  high_device_activity_level: 3,
};

/** إشارات specs §A الطبقة 3: كل واحدة وحدها ترفع إلى PENDING_REVIEW. */
const STANDALONE_RISKS: readonly ReasonCode[] = [
  'RISK_MOCK_LOCATION',
  'RISK_DEVICE_INTEGRITY',
  'RISK_IMPOSSIBLE_TRAVEL',
  'RISK_CLOCK_SKEW',
  'RISK_SHARED_DEVICE',
  'RISK_RECENT_REBIND',
];

const HARD_CHECKS: readonly [keyof TrustInput['checks'], ReasonCode][] = [
  ['account_active', 'ACCOUNT_INACTIVE'],
  ['tenant_active', 'TENANT_INACTIVE'],
  ['device_bound', 'DEVICE_NOT_BOUND'],
  ['attestation_ok', 'ATTESTATION_FAILED'],
  ['challenge_valid', 'CHALLENGE_INVALID'],
];

function result(partial: Partial<TrustResult> & Pick<TrustResult, 'decision' | 'reasons'>): TrustResult {
  return {
    signals: [],
    next_action: nextActionFor(partial.decision, partial.reasons),
    site_id: null,
    geofence_version_id: null,
    assurance_level: null,
    chosen_sample_index: null,
    s: null,
    a: null,
    risk_points: 0,
    support_points: 0,
    ...partial,
  };
}

export function nextActionFor(decision: Decision, reasons: readonly ReasonCode[]): NextAction {
  if (decision === 'VERIFIED') return 'NONE';
  if (reasons.includes('DEVICE_NOT_BOUND')) return 'REQUEST_DEVICE_CHANGE';
  if (reasons.some((r) => r === 'LOC_LOW_ACCURACY' || r === 'LOC_NO_VALID_SAMPLE' || r === 'LOC_APPROXIMATE_PERMISSION')) {
    return 'RETRY_LOCATION';
  }
  return 'SUBMIT_EXCEPTION';
}

interface SampleFilter {
  valid: { sample: LocationSample; index: number }[];
  futureSample: boolean;
}

/** specs §B «اختيار العينة» + §H2. */
export function filterSamples(input: TrustInput, maxAgeS: number): SampleFilter {
  const received = input.server_received_at.getTime();
  const issued = input.challenge_issued_at.getTime();
  let futureSample = false;
  const valid = input.samples
    .map((sample, index) => ({ sample, index }))
    .filter(({ sample }) => {
      const t = sample.captured_at.getTime();
      if (!Number.isFinite(t)) return false;
      if (t > received + input.policy.future_sample_margin_s * 1000) {
        futureSample = true;
        return false;
      }
      if (t < issued) return false;
      if (received - t > maxAgeS * 1000) return false;
      if (!isValidCoordinate(sample.lat, sample.lng)) return false;
      return Number.isFinite(sample.accuracy_m) && sample.accuracy_m > 0;
    });
  return { valid, futureSample };
}

function bestSample(valid: SampleFilter['valid']) {
  return valid.reduce<SampleFilter['valid'][number] | null>(
    (best, cur) => (best === null || cur.sample.accuracy_m < best.sample.accuracy_m ? cur : best),
    null,
  );
}

/**
 * اختيار الموقع (specs §B): المصرح في الوردية الحالية أولًا، ثم الأقرب.
 * «الأقرب» يُقاس بالمسافة الموقّعة للعينة الأدق.
 */
export function chooseSite(sites: CandidateSite[], sample: LocationSample | null): CandidateSite | null {
  if (!sites.length) return null;
  const pool = sites.some((s) => s.in_current_shift) ? sites.filter((s) => s.in_current_shift) : sites;
  if (!sample) return pool[0] ?? null;
  return pool.reduce((best, cur) => (cur.signedDistance(sample) < best.signedDistance(sample) ? cur : best));
}

type LocOutcome = { decision: Decision; code: ReasonCode };

/** معادلة specs §B. */
export function decideLocation(s: number, a: number, t: number, maxAccuracyM: number): LocOutcome {
  if (a > maxAccuracyM) return { decision: 'PENDING_REVIEW', code: 'LOC_LOW_ACCURACY' };
  if (s + a <= t) return { decision: 'VERIFIED', code: 'LOC_INSIDE' };
  if (s - a > t) return { decision: 'REJECTED', code: 'LOC_OUTSIDE' };
  return { decision: 'PENDING_REVIEW', code: 'LOC_UNCERTAIN' };
}

function collectRisks(input: TrustInput, site: CandidateSite, chosen: LocationSample, valid: SampleFilter['valid'], futureSample: boolean, maxAccuracyM: number): ReasonCode[] {
  const { risk, policy } = input;
  const out = new Set<ReasonCode>();
  if (valid.some(({ sample }) => sample.is_mock || sample.source_info?.simulated)) out.add('RISK_MOCK_LOCATION');
  if (risk.meets_device_integrity === false) out.add('RISK_DEVICE_INTEGRITY');

  if (risk.previous_event) {
    const p = risk.previous_event;
    const d = haversineMeters(p.lat, p.lng, chosen.lat, chosen.lng);
    // ADR-0003: يُخصم هامش دقة الموقعين قبل حساب السرعة.
    const effective = Math.max(0, d - p.accuracy_m - chosen.accuracy_m);
    const hours = (input.server_received_at.getTime() - p.at.getTime()) / 3_600_000;
    if (effective > 0 && (hours <= 0 || effective / 1000 / hours > policy.impossible_speed_kmh)) {
      out.add('RISK_IMPOSSIBLE_TRAVEL');
    }
  }

  const skewed =
    risk.client_time !== undefined &&
    Math.abs(risk.client_time.getTime() - input.server_received_at.getTime()) > policy.max_clock_skew_s * 1000;
  if (skewed || futureSample) out.add('RISK_CLOCK_SKEW');
  if ((risk.other_accounts_on_device_24h ?? 0) > 0) out.add('RISK_SHARED_DEVICE');
  if (risk.rebound_within_days !== undefined && risk.rebound_within_days < policy.recent_rebind_days) {
    out.add('RISK_RECENT_REBIND');
  }

  if (valid.some(({ sample }) => sample.source_info?.accessory)) out.add('RISK_LOCATION_ACCESSORY');
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const x = valid[i]!.sample;
      const y = valid[j]!.sample;
      const gap = haversineMeters(x.lat, x.lng, y.lat, y.lng);
      if (gap > x.accuracy_m + y.accuracy_m + policy.sample_inconsistency_margin_m) out.add('RISK_SAMPLE_INCONSISTENT');
    }
  }
  if (risk.site_accuracy_p50_m !== undefined && chosen.accuracy_m < risk.site_accuracy_p50_m * policy.implausible_accuracy_ratio) {
    out.add('RISK_ACCURACY_IMPLAUSIBLE');
  }
  if (site.known_bssid_hashes.length && risk.wifi_connected_bssid_hash) {
    out.add(site.known_bssid_hashes.includes(risk.wifi_connected_bssid_hash) ? 'SUP_WIFI_KNOWN' : 'RISK_WIFI_UNKNOWN_AT_SITE');
  }
  if ((risk.app_access_risk ?? []).some((v) => /CONTROLLING|CAPTURING/.test(v))) out.add('RISK_REMOTE_CONTROL_APP');
  if ((risk.recent_device_activity_level ?? 0) >= policy.high_device_activity_level) out.add('RISK_HIGH_DEVICE_ACTIVITY');
  if (risk.verified_boot === false) out.add('RISK_BOOT_UNVERIFIED');
  if (risk.app_attest_key_churn) out.add('RISK_APP_ATTEST_KEY_CHURN');
  if (chosen.provider === 'gps' && chosen.accuracy_m <= maxAccuracyM / 2) out.add('SUP_PROVIDER_GNSS');
  return [...out];
}

export function evaluatePunch(input: TrustInput): TrustResult {
  // ── الطبقة 1: فحوص قاطعة ──
  for (const [key, code] of HARD_CHECKS) {
    if (!input.checks[key]) return result({ decision: 'REJECTED', reasons: [code] });
  }
  if (!input.sites.length) return result({ decision: 'REJECTED', reasons: ['NO_AUTHORIZED_SITE'] });
  if (!input.checks.sequence_valid) return result({ decision: 'REJECTED', reasons: ['SEQUENCE_INVALID'] });

  // ── الطبقة 2: الموقع ──
  const loosest = Math.max(...Object.values(input.policy.assurance).map((a) => a.max_sample_age_s));
  const prelim = bestSample(filterSamples(input, loosest).valid);
  const site = chooseSite(input.sites, prelim?.sample ?? null) as CandidateSite;
  const level: AssuranceLevel = site.assurance_level;
  const limits = input.policy.assurance[level];
  const base = { site_id: site.site_id, geofence_version_id: site.geofence_version_id, assurance_level: level };

  if (input.risk.accuracy_authorization === 'reduced' || input.risk.accuracy_authorization === 'approximate') {
    return result({ ...base, decision: 'PENDING_REVIEW', reasons: ['LOC_APPROXIMATE_PERMISSION'] });
  }

  const filtered = filterSamples(input, limits.max_sample_age_s);
  const chosen = bestSample(filtered.valid);
  if (!chosen) {
    const signals: ReasonCode[] = filtered.futureSample ? ['RISK_CLOCK_SKEW'] : [];
    return result({ ...base, decision: 'PENDING_REVIEW', reasons: ['LOC_NO_VALID_SAMPLE', ...signals], signals });
  }

  const s = site.signedDistance(chosen.sample);
  const a = chosen.sample.accuracy_m;
  const loc = decideLocation(s, a, site.tolerance_m, limits.max_accuracy_m);

  // ── الطبقة 3: إشارات الخطر ──
  const signals = collectRisks(input, site, chosen.sample, filtered.valid, filtered.futureSample, limits.max_accuracy_m);
  const weight = (c: ReasonCode) => input.policy.weights[c] ?? 0;
  const risks = signals.filter((c) => c.startsWith('RISK_'));
  const supports = signals.filter((c) => c.startsWith('SUP_'));
  const riskPoints = risks.filter((c) => !STANDALONE_RISKS.includes(c)).reduce((sum, c) => sum + weight(c), 0);
  const supportPoints = supports.reduce((sum, c) => sum + weight(c), 0);
  const standalone = risks.filter((c) => STANDALONE_RISKS.includes(c));
  const aggregatedHit = riskPoints >= input.policy.pending_threshold[level] && riskPoints > 0;

  let decision: Decision = loc.decision;
  const reasons: ReasonCode[] = [loc.code];

  // رفع Wi-Fi المقيد (ADR-0003): لا يتخطى LOC_OUTSIDE أبدًا، ولا مع أي خطر، ولا في STRICT.
  if (
    loc.code === 'LOC_UNCERTAIN' &&
    supports.includes('SUP_WIFI_KNOWN') &&
    site.wifi_uplift_enabled &&
    level !== 'STRICT' &&
    risks.length === 0
  ) {
    decision = 'VERIFIED';
    reasons.push('SUP_WIFI_KNOWN');
  }

  if (decision === 'VERIFIED' && (standalone.length || aggregatedHit)) {
    decision = 'PENDING_REVIEW';
    reasons.push(...standalone, ...(aggregatedHit ? risks.filter((c) => !STANDALONE_RISKS.includes(c) && weight(c) > 0) : []));
  } else if (decision === 'PENDING_REVIEW') {
    reasons.push(...standalone);
  }

  // لا رفض بإشارة خطر إلا بتفعيل صريح من العميل (specs §A).
  const rejectBy = risks.filter((c) => input.policy.reject_on.includes(c));
  if (rejectBy.length && decision !== 'REJECTED') {
    decision = 'REJECTED';
    for (const c of rejectBy) if (!reasons.includes(c)) reasons.push(c);
  }

  return result({
    ...base,
    decision,
    reasons: [...new Set(reasons)],
    signals,
    chosen_sample_index: chosen.index,
    s,
    a,
    risk_points: riskPoints,
    support_points: supportPoints,
  });
}
