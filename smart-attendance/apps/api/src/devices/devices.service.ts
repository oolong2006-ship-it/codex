import { Inject, Injectable } from '@nestjs/common';
import {
  BindingStatus,
  ChangeReason,
  DEFAULT_DEVICE_POLICY,
  DEVICE_POLICY_KIND,
  DevicePolicy,
  activationCodeFromBytes,
  blocksFirstBinding,
  canTransitionBinding,
  normalizeActivationCode,
} from '@sa/domain';
import { randomBytes } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../config';
import { DbService, Tx } from '../db/db.service';
import { AuditMeta, AuditService } from '../common/audit.service';
import { badRequest, conflict, forbidden } from '../common/errors';
import { PoliciesService } from '../common/policies.service';
import { Principal, branchScope, roleCodes } from '../common/principal';
import { TenantChecks } from '../common/tenant-checks';
import { hmacHex, randomToken } from '../auth/crypto';
import { AttestationAdapter } from './attestation';

export interface DeviceRegistration {
  challenge_id: string;
  platform: 'ios' | 'android';
  key_id: string;
  attestation: Record<string, unknown>;
  android_id_hash?: string;
  devicecheck_bit0?: boolean;
  model?: string;
  os_version?: string;
}

const BINDING_COLUMNS = 'id, tenant_id, employee_id, device_id, status, activated_at, ended_at, created_at';

@Injectable()
export class DevicesService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly checks: TenantChecks,
    private readonly attestation: AttestationAdapter,
    private readonly policies: PoliciesService,
  ) {}

  private tenantOf(p: Principal): string {
    if (!p.tenantId) throw forbidden();
    return p.tenantId;
  }

  private async policy(tx: Tx): Promise<DevicePolicy> {
    return (await this.policies.current(tx, DEVICE_POLICY_KIND, DEFAULT_DEVICE_POLICY)).values;
  }

  // ── رمز التفعيل (HR) ───────────────────────────────────────────────────────
  async issueActivationCode(p: Principal, employeeId: string, meta: AuditMeta) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const emp = (await tx.query('SELECT id, tenant_id, status FROM employees WHERE id = $1', [employeeId])).rows[0];
      this.checks.assertOwned(p, emp);
      if (emp.status !== 'ACTIVE') throw forbidden('ACCOUNT_INACTIVE');
      const policy = await this.policy(tx);
      const code = activationCodeFromBytes(randomBytes(8));
      const row = (
        await tx.query(
          `INSERT INTO activation_codes (tenant_id, employee_id, code_hash, expires_at, created_by)
           VALUES ($1, $2, $3, now() + make_interval(hours => $4), $5) RETURNING id, expires_at`,
          [p.tenantId, employeeId, hmacHex(this.config.codeHmacKey, code), policy.activation_code_ttl_hours, p.userId],
        )
      ).rows[0];
      await this.audit.record(tx, meta, {
        action: 'device.activation_code.issued',
        entityType: 'activation_code',
        entityId: row.id,
        after: { employee_id: employeeId, expires_at: row.expires_at },
      });
      return { activation_code_id: row.id, code, expires_at: row.expires_at };
    });
  }

  // ── تحدٍّ لمرة واحدة قبل الربط أو طلب التغيير ─────────────────────────────
  async createChallenge(p: Principal, purpose: 'BIND' | 'CHANGE') {
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const policy = await this.policy(tx);
      const nonce = randomToken(32);
      const row = (
        await tx.query(
          `INSERT INTO attestation_challenges (tenant_id, user_id, nonce_hash, purpose, expires_at)
           VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5)) RETURNING id, expires_at`,
          [p.tenantId, p.userId, hmacHex(this.config.codeHmacKey, nonce), purpose, policy.challenge_ttl_seconds],
        )
      ).rows[0];
      return { challenge_id: row.id, nonce, expires_at: row.expires_at };
    });
  }

  /** يستهلك التحدي ذريًا: صالح، وغير منتهٍ، وغير مستخدم، ولنفس المستخدم والغرض. */
  private async consumeChallenge(tx: Tx, p: Principal, challengeId: string, purpose: 'BIND' | 'CHANGE'): Promise<string> {
    const r = await tx.query(
      `UPDATE attestation_challenges SET used_at = now()
       WHERE id = $1 AND user_id = $2 AND purpose = $3 AND used_at IS NULL AND expires_at > now()
       RETURNING nonce_hash`,
      [challengeId, p.userId, purpose],
    );
    if (!r.rowCount) throw forbidden('ATTESTATION_FAILED');
    return r.rows[0].nonce_hash;
  }

  /** يتحقق من attestation ويسجل الجهاز ونتيجة التحقق. */
  private async registerDevice(tx: Tx, p: Principal, reg: DeviceRegistration, nonceHash: string, meta: AuditMeta) {
    const nonce = typeof reg.attestation.nonce === 'string' ? reg.attestation.nonce : '';
    // التطبيق يعيد التحدي داخل attestation؛ نتحقق أنه هو الصادر لهذه العملية.
    const nonceMatches = hmacHex(this.config.codeHmacKey, nonce) === nonceHash;
    const result = nonceMatches
      ? await this.attestation.verifyKeyAttestation({ platform: reg.platform, keyId: reg.key_id, payload: reg.attestation, nonce })
      : { verified: false, publicKey: null, verdict: { nonce_match: false } };

    // الجهاز المعروف يحتفظ بمفتاحه الموثّق الأول؛ المفتاح الفارغ يُملأ عند أول تحقق ناجح.
    const deviceId: string = (
      await tx.query(
        `INSERT INTO devices (tenant_id, platform, key_id, public_key, android_id_hash, devicecheck_bit0, model, os_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (tenant_id, platform, key_id) DO UPDATE SET public_key = COALESCE(devices.public_key, EXCLUDED.public_key)
         RETURNING id`,
        [p.tenantId, reg.platform, reg.key_id, result.publicKey, reg.android_id_hash ?? null, reg.devicecheck_bit0 ?? null, reg.model ?? null, reg.os_version ?? null],
      )
    ).rows[0].id;
    await tx.query(
      'INSERT INTO device_attestations (tenant_id, device_id, platform, adapter, verified, verdict) VALUES ($1, $2, $3, $4, $5, $6)',
      [p.tenantId, deviceId, reg.platform, this.attestation.name, result.verified, JSON.stringify(result.verdict)],
    );
    if (!result.verified) {
      await this.audit.record(tx, meta, { action: 'device.attestation.failed', entityType: 'device', entityId: deviceId, after: result.verdict });
      return { deviceId, verified: false as const };
    }
    return { deviceId, verified: true as const };
  }

  // ── الربط الأول (specs §C) ────────────────────────────────────────────────
  async bindFirstDevice(p: Principal, activationCode: string, reg: DeviceRegistration, meta: AuditMeta) {
    if (!p.employeeId) throw forbidden();
    const tenantId = this.tenantOf(p);
    // الفشل في التحقق يُسجل في معاملة مستقلة ثم يُرفض الطلب دون أي ارتباط.
    const failure = await this.db.tenantTx(tenantId, async (tx) => {
      const codeRow = (
        await tx.query(
          `SELECT id, employee_id FROM activation_codes
           WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
          [hmacHex(this.config.codeHmacKey, normalizeActivationCode(activationCode))],
        )
      ).rows[0];
      if (!codeRow || codeRow.employee_id !== p.employeeId) throw badRequest('ACTIVATION_CODE_INVALID');

      // F6: وجود ارتباط نشط/موقوف/معلق يعني أن أي جهاز آخر يمر بطلب تغيير معتمد.
      const blocking = (
        await tx.query<{ status: BindingStatus }>(
          "SELECT status FROM device_bindings WHERE employee_id = $1 AND status IN ('ACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION')",
          [p.employeeId],
        )
      ).rows.find((b) => blocksFirstBinding(b.status));
      if (blocking) throw forbidden('DEVICE_CHANGE_REQUIRES_APPROVAL');

      const nonceHash = await this.consumeChallenge(tx, p, reg.challenge_id, 'BIND');
      const device = await this.registerDevice(tx, p, reg, nonceHash, meta);
      if (!device.verified) return 'ATTESTATION_FAILED' as const;

      const takenElsewhere = (
        await tx.query("SELECT 1 FROM device_bindings WHERE device_id = $1 AND status = 'ACTIVE' AND employee_id <> $2", [device.deviceId, p.employeeId])
      ).rowCount;
      if (takenElsewhere) throw conflict('DEVICE_ALREADY_BOUND');

      const policy = await this.policy(tx);
      const status: BindingStatus = policy.first_device_requires_approval ? 'PENDING_ACTIVATION' : 'ACTIVE';
      const binding = (
        await tx.query(
          `INSERT INTO device_bindings (tenant_id, employee_id, device_id, status, activated_at)
           VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'ACTIVE' THEN now() END) RETURNING ${BINDING_COLUMNS}`,
          [tenantId, p.employeeId, device.deviceId, status],
        )
      ).rows[0];
      await tx.query('UPDATE activation_codes SET used_at = now() WHERE id = $1', [codeRow.id]);
      await this.audit.record(tx, meta, { action: 'device.binding.created', entityType: 'device_binding', entityId: binding.id, after: binding });
      return binding;
    });
    if (failure === 'ATTESTATION_FAILED') throw forbidden('ATTESTATION_FAILED');
    return failure;
  }

  // ── طلب تغيير الجهاز (الموظف من الجهاز الجديد) ───────────────────────────
  async requestChange(p: Principal, reason: ChangeReason, note: string | undefined, reg: DeviceRegistration, meta: AuditMeta) {
    if (!p.employeeId) throw forbidden();
    const tenantId = this.tenantOf(p);
    const result = await this.db.tenantTx(tenantId, async (tx) => {
      const open = (await tx.query("SELECT 1 FROM device_change_requests WHERE employee_id = $1 AND status = 'OPEN' AND expires_at > now()", [p.employeeId])).rowCount;
      if (open) throw conflict('DEVICE_CHANGE_ALREADY_OPEN');
      await tx.query("UPDATE device_change_requests SET status = 'EXPIRED' WHERE employee_id = $1 AND status = 'OPEN' AND expires_at <= now()", [p.employeeId]);

      const nonceHash = await this.consumeChallenge(tx, p, reg.challenge_id, 'CHANGE');
      const device = await this.registerDevice(tx, p, reg, nonceHash, meta);
      if (!device.verified) return 'ATTESTATION_FAILED' as const;

      const current = (
        await tx.query("SELECT id FROM device_bindings WHERE employee_id = $1 AND status IN ('ACTIVE', 'SUSPENDED') ORDER BY created_at DESC LIMIT 1", [p.employeeId])
      ).rows[0];
      const policy = await this.policy(tx);
      const req = (
        await tx.query(
          `INSERT INTO device_change_requests (tenant_id, employee_id, current_binding_id, new_device_id, reason, note, requested_by, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(days => $8))
           RETURNING id, status, reason, current_binding_id, new_device_id, expires_at, created_at`,
          [tenantId, p.employeeId, current?.id ?? null, device.deviceId, reason, note ?? null, p.userId, policy.change_request_ttl_days],
        )
      ).rows[0];
      await this.audit.record(tx, meta, { action: 'device.change_request.created', entityType: 'device_change_request', entityId: req.id, after: req });
      return req;
    });
    if (result === 'ATTESTATION_FAILED') throw forbidden('ATTESTATION_FAILED');
    return result;
  }

  async listChangeRequests(p: Principal, status: string | undefined) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) =>
      (
        await tx.query(
          `SELECT r.id, r.employee_id, e.employee_number, e.full_name, r.reason, r.note, r.status, r.expires_at, r.created_at
           FROM device_change_requests r JOIN employees e ON e.id = r.employee_id
           WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.created_at DESC LIMIT 200`,
          [status ?? null],
        )
      ).rows,
    );
  }

  /**
   * اعتماد HR: القديم SUPERSEDED، والجديد ACTIVE، وإلغاء كل refresh tokens للموظف.
   * لا يعتمد أحد طلبه بنفسه (F7) — حتى لو كان HR.
   */
  async approveChange(p: Principal, requestId: string, meta: AuditMeta) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const req = (await tx.query('SELECT * FROM device_change_requests WHERE id = $1 FOR UPDATE', [requestId])).rows[0];
      this.checks.assertOwned(p, req);
      if (req.requested_by === p.userId || (p.employeeId && req.employee_id === p.employeeId)) {
        throw forbidden('DEVICE_CHANGE_SELF_APPROVAL');
      }
      if (req.status !== 'OPEN') throw conflict('DEVICE_CHANGE_NOT_OPEN');
      if (new Date(req.expires_at) <= new Date()) {
        await tx.query("UPDATE device_change_requests SET status = 'EXPIRED' WHERE id = $1", [requestId]);
        await this.audit.record(tx, meta, { action: 'device.change_request.expired', entityType: 'device_change_request', entityId: requestId });
        return { expired: true as const };
      }

      const before = (await tx.query(`SELECT ${BINDING_COLUMNS} FROM device_bindings WHERE employee_id = $1 AND status IN ('ACTIVE', 'SUSPENDED', 'PENDING_ACTIVATION')`, [req.employee_id])).rows;
      for (const b of before) {
        const to: BindingStatus = b.status === 'PENDING_ACTIVATION' ? 'REVOKED' : 'SUPERSEDED';
        if (to === 'SUPERSEDED' && !canTransitionBinding(b.status, 'SUPERSEDED', 'system')) {
          throw forbidden('BINDING_INVALID_TRANSITION');
        }
        await tx.query('UPDATE device_bindings SET status = $2, ended_at = now(), updated_at = now() WHERE id = $1', [b.id, to]);
      }
      const takenElsewhere = (await tx.query("SELECT 1 FROM device_bindings WHERE device_id = $1 AND status = 'ACTIVE'", [req.new_device_id])).rowCount;
      if (takenElsewhere) throw conflict('DEVICE_ALREADY_BOUND');
      const created = (
        await tx.query(
          `INSERT INTO device_bindings (tenant_id, employee_id, device_id, status, activated_at)
           VALUES ($1, $2, $3, 'ACTIVE', now()) RETURNING ${BINDING_COLUMNS}`,
          [req.tenant_id, req.employee_id, req.new_device_id],
        )
      ).rows[0];
      await tx.query("UPDATE device_change_requests SET status = 'APPROVED', decided_by = $2, decided_at = now() WHERE id = $1", [requestId, p.userId]);
      const revoked = await this.revokeEmployeeSessions(tx, req.employee_id, 'device_changed');
      await this.audit.record(tx, meta, {
        action: 'device.change_request.approved',
        entityType: 'device_change_request',
        entityId: requestId,
        before: { bindings: before },
        after: { binding: created, revoked_refresh_tokens: revoked },
      });
      return { request_id: requestId, status: 'APPROVED', binding: created, revoked_refresh_tokens: revoked };
    }).then((r) => {
      if ('expired' in r) throw conflict('DEVICE_CHANGE_NOT_OPEN');
      return r;
    });
  }

  async rejectChange(p: Principal, requestId: string, meta: AuditMeta) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const req = (await tx.query('SELECT * FROM device_change_requests WHERE id = $1 FOR UPDATE', [requestId])).rows[0];
      this.checks.assertOwned(p, req);
      if (req.requested_by === p.userId || (p.employeeId && req.employee_id === p.employeeId)) {
        throw forbidden('DEVICE_CHANGE_SELF_APPROVAL');
      }
      if (req.status !== 'OPEN') throw conflict('DEVICE_CHANGE_NOT_OPEN');
      await tx.query("UPDATE device_change_requests SET status = 'REJECTED', decided_by = $2, decided_at = now() WHERE id = $1", [requestId, p.userId]);
      await this.audit.record(tx, meta, { action: 'device.change_request.rejected', entityType: 'device_change_request', entityId: requestId, before: { status: 'OPEN' }, after: { status: 'REJECTED' } });
      return { request_id: requestId, status: 'REJECTED' };
    });
  }

  // ── الإيقاف وإعادة التفعيل ────────────────────────────────────────────────
  async transitionBinding(p: Principal, bindingId: string, to: 'SUSPENDED' | 'ACTIVE', meta: AuditMeta) {
    return this.db.tenantTx(this.tenantOf(p), async (tx) => {
      const b = (await tx.query(`SELECT ${BINDING_COLUMNS} FROM device_bindings WHERE id = $1 FOR UPDATE`, [bindingId])).rows[0];
      this.checks.assertOwned(p, b);
      if (!canTransitionBinding(b.status, to, roleCodes(p))) throw forbidden('BINDING_INVALID_TRANSITION');
      const after = (
        await tx.query(`UPDATE device_bindings SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${BINDING_COLUMNS}`, [bindingId, to])
      ).rows[0];
      const revoked = to === 'SUSPENDED' ? await this.revokeEmployeeSessions(tx, b.employee_id, 'binding_suspended') : 0;
      await this.audit.record(tx, meta, {
        action: to === 'SUSPENDED' ? 'device.binding.suspended' : 'device.binding.reactivated',
        entityType: 'device_binding',
        entityId: bindingId,
        before: b,
        after: { ...after, revoked_refresh_tokens: revoked },
      });
      return after;
    });
  }

  async listBindings(p: Principal, employeeId: string | undefined) {
    const scope = branchScope(p);
    return this.db.tenantTx(this.tenantOf(p), async (tx) =>
      (
        await tx.query(
          `SELECT b.id, b.employee_id, e.employee_number, e.branch_id, b.status, d.platform, d.model, b.activated_at, b.ended_at
           FROM device_bindings b JOIN employees e ON e.id = b.employee_id JOIN devices d ON d.id = b.device_id
           WHERE ($1::uuid IS NULL OR b.employee_id = $1) AND ($2::uuid[] IS NULL OR e.branch_id = ANY($2))
           ORDER BY b.created_at DESC LIMIT 500`,
          [employeeId ?? null, scope],
        )
      ).rows,
    );
  }

  private async revokeEmployeeSessions(tx: Tx, employeeId: string, reason: string): Promise<number> {
    const r = await tx.query(
      `UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = $2
       WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM user_accounts WHERE employee_id = $1)`,
      [employeeId, reason],
    );
    return r.rowCount ?? 0;
  }
}
