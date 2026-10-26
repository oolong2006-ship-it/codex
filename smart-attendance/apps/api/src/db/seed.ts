/**
 * بيانات التطوير فقط (CLAUDE.md §5.7): عميلان A وB، لكل منهما فرعان وموظفون بأدوار مختلفة،
 * ومسؤول منصة. يرفض العمل في الإنتاج. idempotent عبر slug العميل.
 */
import { hash } from '@node-rs/argon2';
import { Client } from 'pg';
import { DEFAULT_DEVICE_POLICY, DEVICE_POLICY_KIND, Role } from '@sa/domain';

interface SeedUser {
  email: string;
  phone: string;
  name: string;
  employeeNumber: string;
  branch: 0 | 1;
  roles: { role: Role; branch?: 0 | 1 }[];
}

const TENANTS: { slug: string; name: string; prefix: string }[] = [
  { slug: 'tenant-a', name: 'مطاعم أ (تطوير)', prefix: 'a' },
  { slug: 'tenant-b', name: 'مطاعم ب (تطوير)', prefix: 'b' },
];

function usersFor(prefix: string, phoneBase: number): SeedUser[] {
  return [
    { email: `admin@${prefix}.dev`, phone: `+9665${phoneBase}0001`, name: 'مسؤول العميل', employeeNumber: `${prefix.toUpperCase()}-0001`, branch: 0, roles: [{ role: 'tenant_admin' }] },
    { email: `hr@${prefix}.dev`, phone: `+9665${phoneBase}0002`, name: 'موارد بشرية', employeeNumber: `${prefix.toUpperCase()}-0002`, branch: 0, roles: [{ role: 'hr' }, { role: 'employee' }] },
    { email: `manager1@${prefix}.dev`, phone: `+9665${phoneBase}0003`, name: 'مدير الفرع 1', employeeNumber: `${prefix.toUpperCase()}-0003`, branch: 0, roles: [{ role: 'branch_manager', branch: 0 }, { role: 'employee' }] },
    { email: `manager2@${prefix}.dev`, phone: `+9665${phoneBase}0004`, name: 'مدير الفرع 2', employeeNumber: `${prefix.toUpperCase()}-0004`, branch: 1, roles: [{ role: 'branch_manager', branch: 1 }, { role: 'employee' }] },
    { email: `emp1@${prefix}.dev`, phone: `+9665${phoneBase}0005`, name: 'موظف 1', employeeNumber: `${prefix.toUpperCase()}-0005`, branch: 0, roles: [{ role: 'employee' }] },
    { email: `emp2@${prefix}.dev`, phone: `+9665${phoneBase}0006`, name: 'موظف 2', employeeNumber: `${prefix.toUpperCase()}-0006`, branch: 1, roles: [{ role: 'employee' }] },
    { email: `emp3@${prefix}.dev`, phone: `+9665${phoneBase}0007`, name: 'موظف 3', employeeNumber: `${prefix.toUpperCase()}-0007`, branch: 0, roles: [{ role: 'employee' }] },
  ];
}

export async function seed(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (env.APP_ENV === 'production') throw new Error('Seed is forbidden in production');
  const password = env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is required');
  if (!env.DATABASE_PLATFORM_URL) throw new Error('DATABASE_PLATFORM_URL is required');

  const passwordHash = await hash(password);
  const client = new Client({ connectionString: env.DATABASE_PLATFORM_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const platform = await client.query('SELECT 1 FROM user_accounts WHERE email = $1', ['platform@sa.dev']);
    if (!platform.rowCount) {
      await client.query(
        'INSERT INTO user_accounts (tenant_id, email, password_hash) VALUES (NULL, $1, $2)',
        ['platform@sa.dev', passwordHash],
      );
    }

    for (const [ti, t] of TENANTS.entries()) {
      const existing = await client.query('SELECT id FROM tenants WHERE slug = $1', [t.slug]);
      if (existing.rowCount) continue;
      const tenantId: string = (
        await client.query('INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id', [t.name, t.slug])
      ).rows[0].id;
      await client.query('INSERT INTO tenant_settings (tenant_id) VALUES ($1)', [tenantId]);
      const policyId: string = (
        await client.query(
          "INSERT INTO policies (tenant_id, kind, name) VALUES ($1, $2, 'سياسة الأجهزة') RETURNING id",
          [tenantId, DEVICE_POLICY_KIND],
        )
      ).rows[0].id;
      await client.query(
        "INSERT INTO policy_versions (tenant_id, policy_id, version, effective_from, values) VALUES ($1, $2, 1, '2020-01-01', $3)",
        [tenantId, policyId, JSON.stringify(DEFAULT_DEVICE_POLICY)],
      );
      const branchIds: string[] = [];
      for (const b of [1, 2]) {
        branchIds.push(
          (
            await client.query(
              'INSERT INTO branches (tenant_id, name, code) VALUES ($1, $2, $3) RETURNING id',
              [tenantId, `الفرع ${b}`, `BR-${b}`],
            )
          ).rows[0].id,
        );
      }
      for (const u of usersFor(t.prefix, 50 + ti)) {
        const employeeId: string = (
          await client.query(
            'INSERT INTO employees (tenant_id, employee_number, full_name, branch_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [tenantId, u.employeeNumber, u.name, branchIds[u.branch]],
          )
        ).rows[0].id;
        const userId: string = (
          await client.query(
            'INSERT INTO user_accounts (tenant_id, employee_id, email, phone, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [tenantId, employeeId, u.email, u.phone, passwordHash],
          )
        ).rows[0].id;
        for (const r of u.roles) {
          await client.query(
            'INSERT INTO user_role_assignments (tenant_id, user_id, role_code, branch_id) VALUES ($1, $2, $3, $4)',
            [tenantId, userId, r.role, r.branch === undefined ? null : branchIds[r.branch]],
          );
        }
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.stdout.write('Seed complete\n'))
    .catch((err: Error) => {
      console.error(err.message);
      process.exit(1);
    });
}
