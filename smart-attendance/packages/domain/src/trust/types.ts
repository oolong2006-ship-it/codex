import type { ReasonCode } from '../reason-codes';

export type Decision = 'VERIFIED' | 'PENDING_REVIEW' | 'REJECTED';
export type NextAction = 'NONE' | 'RETRY_LOCATION' | 'SUBMIT_EXCEPTION' | 'REQUEST_DEVICE_CHANGE';
export type AssuranceLevel = 'STANDARD' | 'HIGH' | 'STRICT';

/** عينة موقع كما وصلت من الهاتف (specs §D + §H3). */
export interface LocationSample {
  lat: number;
  lng: number;
  accuracy_m: number;
  captured_at: Date;
  provider?: 'gps' | 'fused' | 'network';
  is_mock?: boolean;
  source_info?: { simulated?: boolean; accessory?: boolean };
}

/** موقع مرشح مع دالة المسافة الموقّعة إلى حدّه (سالبة داخله). يحسبها الخادم عبر PostGIS. */
export interface CandidateSite {
  site_id: string;
  geofence_version_id: string;
  tolerance_m: number;
  assurance_level: AssuranceLevel;
  /** هل الموقع مصرح للموظف في ورديته الحالية؟ */
  in_current_shift: boolean;
  /** هل رفع LOC_UNCERTAIN بـ Wi-Fi مفعّل لهذا الموقع؟ (ADR-0003) */
  wifi_uplift_enabled: boolean;
  /** HMAC لشبكات الفرع المعروفة (ADR-0002/0004). */
  known_bssid_hashes: string[];
  signedDistance: (sample: LocationSample) => number;
}

/** مدخلات الطبقة 1 (specs §A) — يجمعها الخادم قبل التقييم. */
export interface HardChecks {
  account_active: boolean;
  tenant_active: boolean;
  device_bound: boolean;
  attestation_ok: boolean;
  challenge_valid: boolean;
  sequence_valid: boolean;
}

/** إشارات الجهاز والسياق (الطبقة 3). كلها اختيارية: الغياب = لا إشارة. */
export interface RiskContext {
  /** Play Integrity: هل تحقق MEETS_DEVICE_INTEGRITY؟ undefined على iOS. */
  meets_device_integrity?: boolean;
  previous_event?: { at: Date; lat: number; lng: number; accuracy_m: number };
  client_time?: Date;
  other_accounts_on_device_24h?: number;
  rebound_within_days?: number;
  accuracy_authorization?: 'full' | 'reduced' | 'approximate';
  wifi_connected_bssid_hash?: string;
  app_access_risk?: string[];
  recent_device_activity_level?: 1 | 2 | 3 | 4;
  verified_boot?: boolean;
  app_attest_key_churn?: boolean;
  /** p50 لدقة البصمات الموثوقة في الموقع (من لقطة المعايرة، ADR-0004). */
  site_accuracy_p50_m?: number;
}

export interface AssuranceDefaults {
  max_accuracy_m: number;
  max_sample_age_s: number;
}

/** السياسة السارية (إصدار) — كل الأرقام هنا لا في الكود (CLAUDE.md §5.4). */
export interface TrustPolicy {
  assurance: Record<AssuranceLevel, AssuranceDefaults>;
  /** هامش قبول عينة «من المستقبل» بالثواني. */
  future_sample_margin_s: number;
  max_clock_skew_s: number;
  impossible_speed_kmh: number;
  recent_rebind_days: number;
  /** عتبة اختلاف عينتين داخل النافذة نفسها (م) فوق مجموع دقتيهما. */
  sample_inconsistency_margin_m: number;
  /** نسبة الدقة المعلنة إلى p50 المعايَر التي تعد «غير معقولة». */
  implausible_accuracy_ratio: number;
  /** أوزان الإشارات المجمعة (H1). */
  weights: Partial<Record<ReasonCode, number>>;
  pending_threshold: Record<AssuranceLevel, number>;
  /** إشارات يرفعها العميل صراحة إلى REJECTED (specs §A). */
  reject_on: ReasonCode[];
  high_device_activity_level: 3 | 4;
}

export interface TrustInput {
  checks: HardChecks;
  /** موقع مصرح واحد على الأقل في هذا الوقت؟ (NO_AUTHORIZED_SITE) */
  sites: CandidateSite[];
  samples: LocationSample[];
  server_received_at: Date;
  challenge_issued_at: Date;
  risk: RiskContext;
  policy: TrustPolicy;
}

export interface TrustResult {
  decision: Decision;
  reasons: ReasonCode[];
  signals: ReasonCode[];
  next_action: NextAction;
  site_id: string | null;
  geofence_version_id: string | null;
  assurance_level: AssuranceLevel | null;
  chosen_sample_index: number | null;
  s: number | null;
  a: number | null;
  risk_points: number;
  support_points: number;
}
