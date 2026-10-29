import { DEFAULT_POLICIES } from '@sa/domain';

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: { id: string }[] }>;
}

/** السياسات الابتدائية لعميل جديد (إصدار 1 لكل نوع). تستخدمه المنصة والـ seed. */
export async function insertDefaultPolicies(db: Queryable, tenantId: string, effectiveFrom: string | Date = new Date()): Promise<void> {
  for (const p of DEFAULT_POLICIES) {
    const policyId = (
      await db.query('INSERT INTO policies (tenant_id, kind, name) VALUES ($1, $2, $3) RETURNING id', [tenantId, p.kind, p.name])
    ).rows[0]!.id;
    await db.query(
      'INSERT INTO policy_versions (tenant_id, policy_id, version, effective_from, values) VALUES ($1, $2, 1, $3, $4)',
      [tenantId, policyId, effectiveFrom, JSON.stringify(p.values)],
    );
  }
}
