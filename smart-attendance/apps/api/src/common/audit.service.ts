import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Tx } from '../db/db.service';
import type { AuthedRequest, Principal } from './principal';

/** الحقول الحساسة تُخزن hash في before/after (specs §F). */
const SENSITIVE_KEYS = /password|secret|token|code_hash|^code$|nonce|attestation|assertion|public_key/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        SENSITIVE_KEYS.test(k) && v !== null && v !== undefined
          ? `sha256:${createHash('sha256').update(JSON.stringify(v)).digest('hex')}`
          : redact(v);
    }
    return out;
  }
  return value;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface AuditMeta {
  actorType: 'user' | 'platform_admin' | 'system';
  actorId: string | null;
  tenantId: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export function auditMeta(req: AuthedRequest, principal?: Principal): AuditMeta {
  const p = principal ?? req.principal;
  return {
    actorType: p ? (p.tenantId ? 'user' : 'platform_admin') : 'system',
    actorId: p?.userId ?? null,
    tenantId: p?.tenantId ?? null,
    ip: req.ip ?? null,
    userAgent: req.get?.('user-agent') ?? null,
    requestId: req.requestId ?? null,
  };
}

/**
 * يكتب سجل التدقيق داخل معاملة العملية نفسها، فلا تُعتمد عملية دون سجلها.
 * audit_logs append-only بـ trigger وصلاحيات (specs §F، F16).
 */
@Injectable()
export class AuditService {
  async record(tx: Tx, meta: AuditMeta, entry: AuditEntry): Promise<void> {
    await tx.query(
      `INSERT INTO audit_logs (tenant_id, actor_type, actor_id, action, entity_type, entity_id, before, after, ip, user_agent, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        meta.tenantId,
        meta.actorType,
        meta.actorId,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.before === undefined ? null : JSON.stringify(redact(entry.before)),
        entry.after === undefined ? null : JSON.stringify(redact(entry.after)),
        meta.ip ?? null,
        meta.userAgent ?? null,
        meta.requestId ?? null,
      ],
    );
  }
}
