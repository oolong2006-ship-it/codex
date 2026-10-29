import { HttpStatus, Injectable } from '@nestjs/common';
import type { Tx } from '../db/db.service';
import { ApiError } from './errors';

export interface PolicyVersion<T> {
  id: string;
  version: number;
  values: T;
}

/**
 * السياسة السارية في لحظة معينة (CLAUDE.md §5.4): إصدار + تاريخ سريان.
 * القيم المخزنة تُدمج فوق الافتراضيات كي لا ينكسر إصدار قديم عند إضافة مفتاح جديد.
 */
@Injectable()
export class PoliciesService {
  async current<T extends object>(tx: Tx, kind: string, defaults: T, at: Date = new Date()): Promise<PolicyVersion<T>> {
    const r = await tx.query(
      `SELECT pv.id, pv.version, pv.values FROM policy_versions pv JOIN policies p ON p.id = pv.policy_id
       WHERE p.kind = $1 AND pv.effective_from <= $2 ORDER BY pv.effective_from DESC, pv.version DESC LIMIT 1`,
      [kind, at],
    );
    const row = r.rows[0];
    if (!row) {
      throw new ApiError('VALIDATION_FAILED', HttpStatus.UNPROCESSABLE_ENTITY, { reason: `${kind} policy missing` });
    }
    return { id: row.id, version: row.version, values: { ...defaults, ...row.values } };
  }
}
