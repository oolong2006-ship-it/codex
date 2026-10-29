import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ATTENDANCE_POLICY_KIND,
  AssuranceLevel,
  CandidateSite,
  DEFAULT_ATTENDANCE_POLICY,
  DEFAULT_TRUST_POLICY,
  ENGINE_VERSION,
  LocationSample,
  PunchType,
  ReasonCode,
  RiskContext,
  TRUST_POLICY_KIND,
  TrustPolicy,
  bilingual,
  canonicalJson,
  evaluatePunch,
  isValidCoordinate,
} from '@sa/domain';
import { APP_CONFIG, AppConfig } from '../config';
import { DbService, Tx } from '../db/db.service';
import { AuditMeta, AuditService } from '../common/audit.service';
import { ApiError, badRequest, conflict, forbidden } from '../common/errors';
import { PoliciesService } from '../common/policies.service';
import { Principal } from '../common/principal';
import { randomToken, sha256Hex } from '../auth/crypto';
import { AttestationAdapter, DeviceSignals } from '../devices/attestation';
import { SessionsService } from './sessions.service';

export interface PunchSample {
  lat: number;
  lng: number;
  accuracy_m: number;
  captured_at: string;
  provider?: 'gps' | 'fused' | 'network';
  is_mock?: boolean;
  source_info?: { simulated?: boolean; accessory?: boolean };
}

/** جسم البصمة (specs §D). `attestation` خارج التوقيع. */
export interface PunchInput {
  challenge_id: string;
  type: PunchType;
  location_samples: PunchSample[];
  client_time?: string;
  client_tz?: string;
  app_version: string;
  os: 'ios' | 'android';
  os_version?: string;
  offline?: boolean;
  accuracy_authorization?: 'full' | 'reduced' | 'approximate';
  attestation: Record<string, unknown>;
}

interface DeviceRow {
  binding_id: string;
  device_id: string;
  platform: 'ios' | 'android';
  key_id: string;
  public_key: string | null;
}

interface SiteRow {
  site_id: string;
  name: string;
  assurance_level: AssuranceLevel;
  wifi_uplift_enabled: boolean;
  known_bssid_hashes: string[];
  gv_id: string;
  tolerance_m: string;
}

/**
 * ما يُوقَّع: كل الحقول ما عدا attestation. الهاتف يحسب المقطع نفسه بـ canonicalJson.
 * تُختار الحقول صراحةً كي لا يدخل أي حقل غير موثّق في التوقيع.
 */
export function signedFields(input: PunchInput) {
  return {
    challenge_id: input.challenge_id,
    type: input.type,
    location_samples: input.location_samples,
    client_time: input.client_time,
    client_tz: input.client_tz,
    app_version: input.app_version,
    os: input.os,
    os_version: input.os_version,
    offline: input.offline,
    accuracy_authorization: input.accuracy_authorization,
  };
}

/** clientDataHash = SHA256(nonce ‖ canonical_json(body دون attestation)) — specs §D. */
export function clientDataHash(nonce: string, signedJson: string): string {
  return sha256Hex(nonce + signedJson);
}

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly adapter: AttestationAdapter,
    private readonly policies: PoliciesService,
    private readonly sessions: SessionsService,
  ) {}

  private tenantOf(p: Principal): string {
    if (!p.tenantId) throw forbidden();
    return p.tenantId;
  }

  /** تحدٍّ لمرة واحدة قبل كل بصمة (specs §D.1). */
  async createChallenge(p: Principal, now: Date = new Date()) {
    const tenantId = this.tenantOf(p);
    return this.db.tenantTx(tenantId, async (tx) => {
      const policy = await this.policies.current(tx, ATTENDANCE_POLICY_KIND, DEFAULT_ATTENDANCE_POLICY, now);
      const nonce = randomToken(32);
      const expiresAt = new Date(now.getTime() + policy.values.challenge_ttl_seconds * 1000);
      const row = (
        await tx.query(
          'INSERT INTO attendance_challenges (tenant_id, user_id, nonce, issued_at, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [tenantId, p.userId, nonce, now, expiresAt],
        )
      ).rows[0];
      return { challenge_id: row.id as string, nonce, expires_at: expiresAt.toISOString() };
    });
  }

  /**
   * تسجيل البصمة. كل محاولة تُنشئ حدثًا وقرارًا (حتى المرفوضة)، ولا يُعاد استخدام
   * المفتاح إلا بالطلب نفسه (specs §D: Idempotency 24 ساعة).
   */
  async punch(p: Principal, input: PunchInput, idempotencyKey: string, meta: AuditMeta, now: Date = new Date()) {
    if (!p.employeeId) throw forbidden();
    const employeeId: string = p.employeeId;
    if (input.offline) throw badRequest('VALIDATION_FAILED', { field: 'offline', reason: 'offline punches are out of scope' });
    const tenantId = this.tenantOf(p);
    const signedJson = canonicalJson(signedFields(input));
    const requestHash = sha256Hex(signedJson);

    return this.db.tenantTx(tenantId, async (tx) => {
      // تسلسل البصمات لكل موظف: يغطي التحقق من التسلسل، ويجعل المفتاح المكرر ينتظر الطلب الأول.
      await tx.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [employeeId]);
      const prior = (
        await tx.query<{ request_hash: string; response: unknown; expires_at: Date }>(
          'SELECT request_hash, response, expires_at FROM idempotency_keys WHERE tenant_id = $1 AND user_id = $2 AND key = $3',
          [tenantId, p.userId, idempotencyKey],
        )
      ).rows[0];
      if (prior) {
        if (new Date(prior.expires_at) > now) {
          if (prior.request_hash !== requestHash) throw conflict('IDEMPOTENCY_KEY_REUSED');
          return prior.response;
        }
        await tx.query('DELETE FROM idempotency_keys WHERE tenant_id = $1 AND user_id = $2 AND key = $3', [tenantId, p.userId, idempotencyKey]);
      }

      const attendance = await this.policies.current(tx, ATTENDANCE_POLICY_KIND, DEFAULT_ATTENDANCE_POLICY, now);
      if (!attendance.values.breaks_enabled && input.type.startsWith('BREAK_')) {
        throw new ApiError('FEATURE_NOT_ENABLED', HttpStatus.UNPROCESSABLE_ENTITY);
      }
      const trust = await this.policies.current<TrustPolicy>(tx, TRUST_POLICY_KIND, DEFAULT_TRUST_POLICY, now);

      const state = (
        await tx.query<{ emp_status: string; user_status: string; tenant_status: string }>(
          `SELECT e.status AS emp_status, u.status AS user_status, t.status AS tenant_status
           FROM employees e JOIN user_accounts u ON u.employee_id = e.id JOIN tenants t ON t.id = e.tenant_id
           WHERE e.id = $1 AND u.id = $2`,
          [employeeId, p.userId],
        )
      ).rows[0];

      // ── التحدي: استهلاك ذري، ولنفس المستخدم وغير منتهٍ وغير مستخدم ──
      const challenge = (
        await tx.query<{ id: string; nonce: string; issued_at: Date }>(
          `UPDATE attendance_challenges SET used_at = $3
           WHERE id = $1 AND user_id = $2 AND used_at IS NULL AND expires_at > $3
           RETURNING id, nonce, issued_at`,
          [input.challenge_id, p.userId, now],
        )
      ).rows[0];

      // ── الجهاز المربوط ──
      const device = (
        await tx.query<DeviceRow>(
          `SELECT b.id AS binding_id, d.id AS device_id, d.platform, d.key_id, d.public_key
           FROM device_bindings b JOIN devices d ON d.id = b.device_id
           WHERE b.employee_id = $1 AND b.status = 'ACTIVE' LIMIT 1`,
          [employeeId],
        )
      ).rows[0];
      const deviceBound = Boolean(device) && device!.key_id === String(input.attestation.key_id ?? '') && device!.platform === input.os;

      const accountActive = state?.emp_status === 'ACTIVE' && state?.user_status === 'ACTIVE';
      const tenantActive = state?.tenant_status === 'ACTIVE';

      // التوقيع لا يُفحص إلا بتحدٍّ صالح وجهاز مربوط لحساب وعميل نشطين؛ جهاز بلا مفتاح موثّق يُرفض توقيعه (فشل مغلق).
      let attestationOk = true;
      let deviceSignals: DeviceSignals = {};
      if (challenge && deviceBound && accountActive && tenantActive) {
        const result = await this.adapter.verifyAssertion({
          platform: device!.platform,
          keyId: device!.key_id,
          publicKey: device!.public_key,
          clientDataHash: clientDataHash(challenge.nonce, signedJson),
          payload: input.attestation,
        });
        attestationOk = result.verified;
        deviceSignals = result.signals;
      }

      const samples: LocationSample[] = input.location_samples.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        accuracy_m: s.accuracy_m,
        captured_at: new Date(s.captured_at),
        provider: s.provider,
        is_mock: s.is_mock,
        source_info: s.source_info,
      }));

      // الطبقات التالية تُقرأ فقط إذا اجتازت الفحوص القاطعة: القرار يرفض قبلها دون حاجة إليها.
      const cleared = accountActive && tenantActive && deviceBound && attestationOk && Boolean(challenge);
      let sequenceValid = true;
      let siteRows: SiteRow[] = [];
      let sites: CandidateSite[] = [];
      let risk: RiskContext = {};
      if (cleared) {
        // ── تسلسل الحضور: الانصراف يحتاج حضورًا مفتوحًا ──
        const lastDecided = (
          await tx.query<{ type: PunchType }>(
            `SELECT e.type FROM attendance_events e JOIN attendance_decisions d ON d.event_id = e.id
             WHERE e.employee_id = $1 AND d.decision <> 'REJECTED' ORDER BY e.server_time DESC LIMIT 1`,
            [employeeId],
          )
        ).rows[0];
        const open = lastDecided?.type === 'CLOCK_IN';
        sequenceValid = input.type !== 'CLOCK_OUT' || open || !attendance.values.clock_out_requires_open_session;

        // ── المواقع المفوّضة الآن ──
        siteRows = (
          await tx.query<SiteRow>(
            `SELECT w.id AS site_id, w.name, w.assurance_level, w.wifi_uplift_enabled, w.known_bssid_hashes,
                    v.id AS gv_id, v.tolerance_m
             FROM employee_site_assignments a
             JOIN work_locations w ON w.id = a.work_location_id
             JOIN geofences g ON g.work_location_id = w.id
             JOIN geofence_versions v ON v.id = g.current_version_id
             WHERE a.employee_id = $1 AND a.valid_from <= $2 AND (a.valid_to IS NULL OR a.valid_to > $2)
               AND w.status = 'ACTIVE'`,
            [employeeId, now],
          )
        ).rows;
        const distancesByVersion = await this.signedDistances(tx, siteRows.map((r) => r.gv_id), samples);
        sites = siteRows.map((row) => {
          const distances = distancesByVersion.get(row.gv_id);
          return {
            site_id: row.site_id,
            geofence_version_id: row.gv_id,
            tolerance_m: Number(row.tolerance_m),
            assurance_level: row.assurance_level,
            // لا ورديات بعد: كل موقع مفوّض يُعد في الوردية الحالية.
            in_current_shift: true,
            wifi_uplift_enabled: row.wifi_uplift_enabled,
            known_bssid_hashes: row.known_bssid_hashes ?? [],
            // الموقع الذي لا مسافة له لا يُختار: يُعد بعيدًا بلا حد.
            signedDistance: (sample) => distances?.get(sample) ?? Number.POSITIVE_INFINITY,
          };
        });

        // ── سياق الخطر: آخر بصمة مقبولة، والأجهزة المشتركة، والربط الأخير ──
        risk = await this.riskContext(tx, input, device, employeeId, now, deviceSignals);
      }

      const result = evaluatePunch({
        checks: {
          account_active: accountActive,
          tenant_active: tenantActive,
          device_bound: deviceBound,
          attestation_ok: attestationOk,
          challenge_valid: Boolean(challenge),
          sequence_valid: sequenceValid,
        },
        sites,
        samples,
        server_received_at: now,
        challenge_issued_at: challenge?.issued_at ?? now,
        risk,
        policy: trust.values,
      });

      // ── الحفظ: الحدث والقرار والأدلة في المعاملة نفسها ──
      const event = (
        await tx.query<{ id: string }>(
          `INSERT INTO attendance_events (tenant_id, employee_id, user_id, type, server_time, client_time, client_tz,
             device_id, device_binding_id, challenge_id, app_version, os, os_version, offline)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
          [
            tenantId, employeeId, p.userId, input.type, now,
            input.client_time ? new Date(input.client_time) : null,
            input.client_tz ?? null,
            deviceBound ? device!.device_id : null,
            deviceBound ? device!.binding_id : null,
            challenge?.id ?? null,
            input.app_version, input.os, input.os_version ?? null, false,
          ],
        )
      ).rows[0]!;
      const eventId = event.id;

      await tx.query(
        `INSERT INTO attendance_decisions (event_id, tenant_id, decision, reasons, signals, next_action,
           work_location_id, geofence_version_id, assurance_level, risk_points, support_points,
           policy_version_id, attendance_policy_version_id, engine_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          eventId, tenantId, result.decision, result.reasons, result.signals, result.next_action,
          result.site_id, result.geofence_version_id, result.assurance_level, result.risk_points,
          result.support_points, trust.id, attendance.id, ENGINE_VERSION,
        ],
      );

      const chosen = result.chosen_sample_index !== null ? samples[result.chosen_sample_index] : undefined;
      await tx.query(
        `INSERT INTO location_evidence (event_id, tenant_id, samples, chosen_index, chosen_point, chosen_accuracy_m,
           signed_distance_m, geofence_version_id, accuracy_authorization)
         VALUES ($1, $2, $3, $4,
           CASE WHEN $5::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($6::float8, $5::float8), 4326)::geography END,
           $7, $8, $9, $10)`,
        [
          eventId, tenantId, JSON.stringify(input.location_samples), result.chosen_sample_index,
          chosen?.lat ?? null, chosen?.lng ?? null, chosen?.accuracy_m ?? null, result.s,
          result.geofence_version_id, input.accuracy_authorization ?? null,
        ],
      );

      const response = {
        event_id: eventId,
        server_time: now.toISOString(),
        decision: result.decision,
        reasons: result.reasons.map((code: ReasonCode) => ({ code, ...bilingual(code) })),
        site: result.site_id ? { id: result.site_id, name: siteRows.find((r) => r.site_id === result.site_id)?.name ?? null } : null,
        next_action: result.next_action,
      };

      await this.audit.record(tx, meta, {
        action: 'attendance.punch',
        entityType: 'attendance_event',
        entityId: eventId,
        after: { type: input.type, decision: result.decision, reasons: result.reasons },
      });
      // الجلسات تتغير بالبصمات المقبولة فقط؛ المرفوضة لا تدخل الجلسات.
      if (result.decision !== 'REJECTED') await this.sessions.rebuild(tx, tenantId, employeeId, now);
      await tx.query(
        `INSERT INTO idempotency_keys (tenant_id, user_id, key, request_hash, status_code, response, created_at, expires_at)
         VALUES ($1, $2, $3, $4, 201, $5, $6, $7)`,
        [
          tenantId, p.userId, idempotencyKey, requestHash, JSON.stringify(response), now,
          new Date(now.getTime() + attendance.values.idempotency_ttl_hours * 3600 * 1000),
        ],
      );
      return response;
    });
  }

  /** آخر البصمات الخاصة بالموظف، أحدث أولًا. */
  async myEvents(p: Principal) {
    if (!p.employeeId) throw forbidden();
    const employeeId = p.employeeId;
    return this.db.tenantTx(this.tenantOf(p), async (tx) =>
      (
        await tx.query(
          `SELECT e.id, e.type, e.server_time, d.decision, d.reasons, d.next_action
           FROM attendance_events e JOIN attendance_decisions d ON d.event_id = e.id
           WHERE e.employee_id = $1 ORDER BY e.server_time DESC LIMIT 50`,
          [employeeId],
        )
      ).rows,
    );
  }

  /**
   * المسافة الموقّعة لكل عينة إلى سياج كل نسخة (specs §B): داخل السياج سالبة.
   * الدائرة: distance − radius. المضلع: −(المسافة إلى الحد) داخله، و+المسافة إليه خارجه.
   * استعلام واحد لكل البصمة مهما عدد المواقع المفوّضة.
   */
  private async signedDistances(
    tx: Tx,
    versionIds: string[],
    samples: LocationSample[],
  ): Promise<Map<string, Map<LocationSample, number>>> {
    const out = new Map<string, Map<LocationSample, number>>();
    const valid = samples.map((s, index) => ({ s, index })).filter(({ s }) => isValidCoordinate(s.lat, s.lng));
    if (!valid.length || !versionIds.length) return out;
    const rows = (
      await tx.query<{ gv_id: string; idx: number; s: number }>(
        `SELECT v.id AS gv_id, p.idx::int AS idx,
           CASE WHEN v.kind = 'CIRCLE' THEN ST_Distance(v.center, p.pt) - v.radius_m
                WHEN ST_Covers(v.polygon, p.pt) THEN -ST_Distance(ST_Boundary(v.polygon::geometry)::geography, p.pt)
                ELSE ST_Distance(v.polygon, p.pt)
           END AS s
         FROM geofence_versions v
         CROSS JOIN LATERAL (
           SELECT u.idx, ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326)::geography AS pt
           FROM unnest($2::float8[], $3::float8[], $4::int[]) AS u(lng, lat, idx)
         ) p
         WHERE v.id = ANY($1::uuid[])`,
        [versionIds, valid.map((x) => x.s.lng), valid.map((x) => x.s.lat), valid.map((x) => x.index)],
      )
    ).rows;
    for (const row of rows) {
      const perSample = out.get(row.gv_id) ?? new Map<LocationSample, number>();
      perSample.set(samples[row.idx]!, Number(row.s));
      out.set(row.gv_id, perSample);
    }
    return out;
  }

  private async riskContext(
    tx: Tx,
    input: PunchInput,
    device: DeviceRow | undefined,
    employeeId: string,
    now: Date,
    signals: DeviceSignals,
  ): Promise<RiskContext> {
    const previous = (
      await tx.query<{ server_time: Date; lat: number; lng: number; accuracy: string }>(
        `SELECT e.server_time, ST_Y(le.chosen_point::geometry) AS lat, ST_X(le.chosen_point::geometry) AS lng,
                le.chosen_accuracy_m AS accuracy
         FROM attendance_events e
         JOIN attendance_decisions d ON d.event_id = e.id
         JOIN location_evidence le ON le.event_id = e.id
         WHERE e.employee_id = $1 AND d.decision <> 'REJECTED' AND le.chosen_point IS NOT NULL
         ORDER BY e.server_time DESC LIMIT 1`,
        [employeeId],
      )
    ).rows[0];
    const rebound = (
      await tx.query<{ days: string | null }>(
        `SELECT EXTRACT(EPOCH FROM ($2::timestamptz - max(ended_at))) / 86400 AS days
         FROM device_bindings WHERE employee_id = $1 AND status = 'SUPERSEDED'`,
        [employeeId, now],
      )
    ).rows[0];
    const sharing = device
      ? (
          await tx.query<{ n: string }>(
            `SELECT count(DISTINCT employee_id) AS n FROM attendance_events
             WHERE device_id = $1 AND employee_id <> $2 AND server_time > ($3::timestamptz - interval '24 hours')`,
            [device.device_id, employeeId, now],
          )
        ).rows[0]
      : undefined;

    return {
      meets_device_integrity: signals.meets_device_integrity,
      previous_event: previous
        ? { at: previous.server_time, lat: previous.lat, lng: previous.lng, accuracy_m: Number(previous.accuracy) }
        : undefined,
      client_time: input.client_time ? new Date(input.client_time) : undefined,
      other_accounts_on_device_24h: sharing ? Number(sharing.n) : undefined,
      rebound_within_days: rebound?.days !== null && rebound?.days !== undefined ? Number(rebound.days) : undefined,
      accuracy_authorization: input.accuracy_authorization,
      app_access_risk: signals.app_access_risk,
      recent_device_activity_level: signals.recent_device_activity_level,
      verified_boot: signals.verified_boot,
      app_attest_key_churn: signals.app_attest_key_churn,
    };
  }
}
