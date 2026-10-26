import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { isRole, requiresMfa } from '@sa/domain';
import { SignJWT, jwtVerify } from 'jose';
import { authenticator } from 'otplib';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../config';
import { DbService, Tx } from '../db/db.service';
import { AuditMeta, AuditService } from '../common/audit.service';
import { ApiError, forbidden, unauthenticated } from '../common/errors';
import type { Principal, RoleGrant } from '../common/principal';
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from './crypto';

authenticator.options = { window: 1, step: 30 };

interface FoundUser {
  id: string;
  tenant_id: string | null;
  password_hash: string;
  status: string;
  mfa_enabled: boolean;
  failed_logins: number;
  locked_until: Date | null;
}

export type LoginResult =
  | { status: 'OK'; access_token: string; refresh_token: string; token_type: 'Bearer'; expires_in: number }
  | { status: 'MFA_REQUIRED' | 'MFA_ENROLLMENT_REQUIRED'; mfa_token: string };

export type TokenPair = Extract<LoginResult, { status: 'OK' }>;

@Injectable()
export class AuthService {
  /** hash ثابت لمعادلة زمن الاستجابة عند عدم وجود المستخدم. */
  private readonly dummyHash: Promise<string>;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {
    this.dummyHash = hash(randomToken());
  }

  /** معاملة بالسياق الصحيح: عميل عبر RLS، أو منصة لمسؤولي المنصة. */
  private txFor<T>(tenantId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return tenantId ? this.db.tenantTx(tenantId, fn) : this.db.platformTx(fn);
  }

  async login(identifier: string, password: string, meta: AuditMeta): Promise<LoginResult> {
    const user = await this.db.anonTx(async (tx) => {
      const r = await tx.query<FoundUser>('SELECT * FROM auth_find_user($1)', [identifier.trim()]);
      return r.rows[0];
    });
    if (!user) {
      await verify(await this.dummyHash, password);
      throw unauthenticated('AUTH_INVALID_CREDENTIALS');
    }
    const m = { ...meta, tenantId: user.tenant_id, actorId: user.id, actorType: user.tenant_id ? 'user' : 'platform_admin' } as AuditMeta;

    if (user.locked_until && user.locked_until > new Date()) {
      await this.txFor(user.tenant_id, (tx) =>
        this.audit.record(tx, m, { action: 'auth.login.locked', entityType: 'user_account', entityId: user.id }),
      );
      throw unauthenticated('AUTH_INVALID_CREDENTIALS');
    }

    if (!(await verify(user.password_hash, password))) {
      await this.txFor(user.tenant_id, async (tx) => {
        const failed = user.failed_logins + 1;
        const lock = failed >= this.config.maxFailedLogins;
        await tx.query(
          `UPDATE user_accounts SET failed_logins = $2,
             locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
           WHERE id = $1`,
          [user.id, lock ? 0 : failed, lock, this.config.lockoutMinutes],
        );
        await this.audit.record(tx, m, {
          action: lock ? 'auth.login.lockout' : 'auth.login.failed',
          entityType: 'user_account',
          entityId: user.id,
        });
      });
      throw unauthenticated('AUTH_INVALID_CREDENTIALS');
    }

    if (user.status !== 'ACTIVE') throw forbidden('ACCOUNT_INACTIVE');
    if (user.tenant_id) await this.assertTenantActive(user.tenant_id);

    await this.txFor(user.tenant_id, (tx) =>
      tx.query('UPDATE user_accounts SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]),
    );

    const principal = await this.loadPrincipal(user.id, user.tenant_id);
    if (requiresMfa(principal.roles.map((r) => r.role))) {
      return {
        status: user.mfa_enabled ? 'MFA_REQUIRED' : 'MFA_ENROLLMENT_REQUIRED',
        mfa_token: await this.signMfaToken(user.id, user.tenant_id),
      };
    }
    return this.issueTokens(principal, m, randomUUID());
  }

  /** يولّد سر TOTP ويخزنه مشفرًا؛ لا يُفعّل حتى يُتحقق من أول رمز. */
  async mfaEnroll(mfaToken: string): Promise<{ otpauth_url: string; secret: string }> {
    const { userId, tenantId } = await this.verifyMfaToken(mfaToken);
    return this.txFor(tenantId, async (tx) => {
      const row = (await tx.query('SELECT email, phone, mfa_enabled FROM user_accounts WHERE id = $1', [userId])).rows[0];
      if (!row) throw unauthenticated();
      if (row.mfa_enabled) throw forbidden();
      const secret = authenticator.generateSecret();
      await tx.query('UPDATE user_accounts SET mfa_secret_enc = $2 WHERE id = $1', [
        userId,
        encryptSecret(this.config.mfaEncKey, secret),
      ]);
      return { secret, otpauth_url: authenticator.keyuri(row.email ?? row.phone, 'Thabt', secret) };
    });
  }

  async mfaVerify(mfaToken: string, code: string, meta: AuditMeta): Promise<TokenPair> {
    const { userId, tenantId } = await this.verifyMfaToken(mfaToken);
    const m = { ...meta, tenantId, actorId: userId, actorType: tenantId ? 'user' : 'platform_admin' } as AuditMeta;
    await this.txFor(tenantId, async (tx) => {
      const row = (
        await tx.query('SELECT mfa_secret_enc, mfa_enabled, mfa_last_step FROM user_accounts WHERE id = $1 FOR UPDATE', [userId])
      ).rows[0];
      if (!row?.mfa_secret_enc) throw unauthenticated('AUTH_MFA_ENROLLMENT_REQUIRED');
      const delta = authenticator.checkDelta(code, decryptSecret(this.config.mfaEncKey, row.mfa_secret_enc));
      if (delta === null) throw unauthenticated('AUTH_MFA_INVALID');
      // كل رمز يُقبل مرة واحدة: الخطوة يجب أن تتقدم.
      const step = Math.floor(Date.now() / 1000 / authenticator.options.step!) + delta;
      if (row.mfa_last_step !== null && step <= Number(row.mfa_last_step)) throw unauthenticated('AUTH_MFA_INVALID');
      await tx.query('UPDATE user_accounts SET mfa_last_step = $2 WHERE id = $1', [userId, step]);
      if (!row.mfa_enabled) {
        await tx.query('UPDATE user_accounts SET mfa_enabled = true WHERE id = $1', [userId]);
        await this.audit.record(tx, m, { action: 'auth.mfa.enrolled', entityType: 'user_account', entityId: userId });
      }
    });
    return this.issueTokens(await this.loadPrincipal(userId, tenantId), m, randomUUID());
  }

  /**
   * تدوير refresh token. إعادة استخدام رمز مُدوّر = سرقة محتملة ← إلغاء العائلة كلها.
   */
  async refresh(refreshToken: string, meta: AuditMeta): Promise<TokenPair> {
    const tokenHash = sha256Hex(refreshToken);
    const found = await this.db.anonTx(async (tx) => (await tx.query('SELECT * FROM auth_find_refresh($1)', [tokenHash])).rows[0]);
    if (!found) throw unauthenticated('AUTH_REFRESH_INVALID');
    const tenantId: string | null = found.tenant_id;
    const m = { ...meta, tenantId, actorId: found.user_id, actorType: tenantId ? 'user' : 'platform_admin' } as AuditMeta;

    if (found.revoked_at) {
      if (found.replaced_by) {
        await this.txFor(tenantId, async (tx) => {
          await tx.query(
            "UPDATE refresh_tokens SET revoked_at = coalesce(revoked_at, now()), revoked_reason = coalesce(revoked_reason, 'reuse_detected') WHERE family_id = $1",
            [found.family_id],
          );
          await this.audit.record(tx, m, { action: 'auth.refresh.reuse_detected', entityType: 'refresh_token_family', entityId: found.family_id });
        });
        throw unauthenticated('AUTH_REFRESH_REUSED');
      }
      throw unauthenticated('AUTH_REFRESH_INVALID');
    }
    if (new Date(found.expires_at) <= new Date()) throw unauthenticated('AUTH_REFRESH_INVALID');

    const user = await this.txFor(tenantId, async (tx) =>
      (await tx.query('SELECT status FROM user_accounts WHERE id = $1', [found.user_id])).rows[0],
    );
    if (!user || user.status !== 'ACTIVE') throw forbidden('ACCOUNT_INACTIVE');
    if (tenantId) await this.assertTenantActive(tenantId);

    const principal = await this.loadPrincipal(found.user_id, tenantId);
    return this.issueTokens(principal, m, found.family_id, found.id);
  }

  async logout(refreshToken: string): Promise<void> {
    const found = await this.db.anonTx(async (tx) => (await tx.query('SELECT * FROM auth_find_refresh($1)', [sha256Hex(refreshToken)])).rows[0]);
    if (!found) return;
    await this.txFor(found.tenant_id, (tx) =>
      tx.query("UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'logout' WHERE family_id = $1 AND revoked_at IS NULL", [found.family_id]),
    );
  }

  async verifyAccessToken(token: string): Promise<Principal> {
    try {
      const { payload } = await jwtVerify(token, this.config.jwtSecret, { algorithms: ['HS256'], typ: 'access' });
      return payload.principal as Principal;
    } catch {
      throw unauthenticated();
    }
  }

  private async issueTokens(principal: Principal, meta: AuditMeta, familyId: string, rotatedFrom?: string): Promise<TokenPair> {
    const access = await new SignJWT({ principal })
      .setProtectedHeader({ alg: 'HS256', typ: 'access' })
      .setSubject(principal.userId)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenTtlSeconds}s`)
      .sign(this.config.jwtSecret);
    const refresh = randomToken();
    await this.txFor(principal.tenantId, async (tx) => {
      if (rotatedFrom) {
        // شرطي: طلبا تحديث متزامنان بنفس الرمز — واحد فقط ينجح.
        const claimed = await tx.query(
          "UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'rotated' WHERE id = $1 AND revoked_at IS NULL",
          [rotatedFrom],
        );
        if (!claimed.rowCount) throw unauthenticated('AUTH_REFRESH_REUSED');
      }
      const id: string = (
        await tx.query(
          `INSERT INTO refresh_tokens (tenant_id, user_id, family_id, token_hash, expires_at)
           VALUES ($1, $2, $3, $4, now() + make_interval(days => $5)) RETURNING id`,
          [principal.tenantId, principal.userId, familyId, sha256Hex(refresh), this.config.refreshTokenTtlDays],
        )
      ).rows[0].id;
      if (rotatedFrom) {
        await tx.query('UPDATE refresh_tokens SET replaced_by = $2 WHERE id = $1', [rotatedFrom, id]);
      } else {
        await this.audit.record(tx, meta, { action: 'auth.login.success', entityType: 'user_account', entityId: principal.userId });
      }
    });
    return { status: 'OK', access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: this.config.accessTokenTtlSeconds };
  }

  async loadPrincipal(userId: string, tenantId: string | null): Promise<Principal> {
    return this.txFor(tenantId, async (tx) => {
      const u = (await tx.query('SELECT employee_id FROM user_accounts WHERE id = $1', [userId])).rows[0];
      if (!u) throw unauthenticated();
      const roles: RoleGrant[] = tenantId
        ? (
            await tx.query<{ role_code: string; branch_id: string | null }>(
              'SELECT role_code, branch_id FROM user_role_assignments WHERE user_id = $1',
              [userId],
            )
          ).rows
            .filter((r) => isRole(r.role_code))
            .map((r) => ({ role: r.role_code as RoleGrant['role'], branchId: r.branch_id }))
        : [{ role: 'platform_admin', branchId: null }];
      const perms = (
        await tx.query<{ permission_code: string }>(
          'SELECT DISTINCT permission_code FROM role_permissions WHERE role_code = ANY($1::text[])',
          [roles.map((r) => r.role)],
        )
      ).rows.map((r) => r.permission_code);
      return { userId, tenantId, employeeId: u.employee_id ?? null, roles, permissions: perms.sort() };
    });
  }

  private async assertTenantActive(tenantId: string): Promise<void> {
    const t = await this.db.tenantTx(tenantId, async (tx) => (await tx.query('SELECT status FROM tenants WHERE id = $1', [tenantId])).rows[0]);
    if (!t || t.status !== 'ACTIVE') throw new ApiError('TENANT_INACTIVE', HttpStatus.FORBIDDEN);
  }

  private signMfaToken(userId: string, tenantId: string | null): Promise<string> {
    return new SignJWT({ tid: tenantId })
      .setProtectedHeader({ alg: 'HS256', typ: 'mfa' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${this.config.mfaTokenTtlSeconds}s`)
      .sign(this.config.jwtSecret);
  }

  private async verifyMfaToken(token: string): Promise<{ userId: string; tenantId: string | null }> {
    try {
      const { payload } = await jwtVerify(token, this.config.jwtSecret, { algorithms: ['HS256'], typ: 'mfa' });
      return { userId: payload.sub as string, tenantId: (payload.tid as string | null) ?? null };
    } catch {
      throw unauthenticated('AUTH_MFA_INVALID');
    }
  }
}
