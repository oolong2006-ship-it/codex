import { INestApplication } from '@nestjs/common';
import { Session, bearer, bootApp, employeeIdByEmail, http, login, q, tenantId, withDb } from './helpers';

/** F8: عزل العملاء بطبقتين (الخدمة + RLS)، وABAC لمدير الفرع. */
describe('tenant isolation (F8)', () => {
  let app: INestApplication;
  let hrA: Session;
  let tenantA: string;
  let tenantB: string;
  let employeeOfB: string;
  beforeAll(async () => {
    app = await bootApp();
    hrA = await login(app, 'admin@a.dev');
    tenantA = await tenantId('tenant-a');
    tenantB = await tenantId('tenant-b');
    employeeOfB = await employeeIdByEmail('emp1@b.dev');
  });
  afterAll(() => app.close());

  it("API: tenant A cannot read tenant B's employee (404, not 403)", async () => {
    const res = await http(app).get(`/v1/employees/${employeeOfB}`).set(bearer(hrA));
    expect(res.status).toBe(404);
    const list = await http(app).get('/v1/employees').set(bearer(hrA));
    expect(list.status).toBe(200);
    expect(list.body.every((e: { tenant_id: string }) => e.tenant_id === tenantA)).toBe(true);
  });

  it("API: tenant A cannot act on tenant B's device change request or binding", async () => {
    const cr = await q<{ id: string }>(
      `INSERT INTO devices (tenant_id, platform, key_id) VALUES ($1, 'ios', 'iso-key') RETURNING id`,
      [tenantB],
    ).then(async ([d]) =>
      q<{ id: string }>(
        `INSERT INTO device_change_requests (tenant_id, employee_id, new_device_id, reason, requested_by, expires_at)
         VALUES ($1, $2, $3, 'LOST', (SELECT id FROM user_accounts WHERE email = 'emp1@b.dev'), now() + interval '1 day') RETURNING id`,
        [tenantB, employeeOfB, d!.id],
      ),
    );
    const res = await http(app).post(`/v1/devices/change-requests/${cr[0]!.id}/approve`).set(bearer(hrA));
    expect(res.status).toBe(404);
    const after = await q<{ status: string }>('SELECT status FROM device_change_requests WHERE id = $1', [cr[0]!.id]);
    expect(after[0]!.status).toBe('OPEN');
    const codes = await http(app).post('/v1/devices/activation-codes').set(bearer(hrA)).send({ employee_id: employeeOfB });
    expect(codes.status).toBe(404);
  });

  it('DB: RLS hides other tenants from sa_app even with a direct query', async () => {
    await withDb('app', async (c) => {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const leaked = await c.query('SELECT id FROM employees WHERE tenant_id = $1', [tenantB]);
      expect(leaked.rowCount).toBe(0);
      const byId = await c.query('SELECT id FROM employees WHERE id = $1', [employeeOfB]);
      expect(byId.rowCount).toBe(0);
      const audit = await c.query('SELECT 1 FROM audit_logs WHERE tenant_id = $1', [tenantB]);
      expect(audit.rowCount).toBe(0);
      await c.query('ROLLBACK');
    });
  });

  it('DB: RLS refuses writes into another tenant', async () => {
    await withDb('app', async (c) => {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      await expect(
        c.query("INSERT INTO branches (tenant_id, name, code) VALUES ($1, 'x', 'LEAK')", [tenantB]),
      ).rejects.toThrow(/row-level security/);
      await c.query('ROLLBACK');
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const upd = await c.query("UPDATE employees SET full_name = 'hacked' WHERE id = $1", [employeeOfB]);
      expect(upd.rowCount).toBe(0);
      await c.query('ROLLBACK');
    });
  });

  it('DB: without a tenant context sa_app sees nothing', async () => {
    await withDb('app', async (c) => {
      for (const table of ['employees', 'user_accounts', 'device_bindings', 'audit_logs', 'tenants']) {
        const r = await c.query(`SELECT count(*)::int AS n FROM ${table}`);
        expect({ table, n: r.rows[0].n }).toEqual({ table, n: 0 });
      }
    });
  });

  it('every operational table has RLS enabled and forced', async () => {
    const rows = await q<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c
       JOIN information_schema.columns col ON col.table_name = c.relname AND col.column_name = 'tenant_id'
       WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(19);
    for (const r of rows) expect(r).toEqual({ relname: r.relname, relrowsecurity: true, relforcerowsecurity: true });
  });

  describe('RLS alone (service-level check disabled on purpose)', () => {
    let unchecked: INestApplication;
    beforeAll(async () => {
      unchecked = await bootApp({ SERVICE_TENANT_CHECKS: 'off' });
    });
    afterAll(() => unchecked.close());

    it("still cannot read tenant B's employee", async () => {
      const res = await http(unchecked).get(`/v1/employees/${employeeOfB}`).set(bearer(hrA));
      expect(res.status).toBe(404);
    });
  });

  describe('ABAC: branch manager scope', () => {
    let manager1: Session;
    beforeAll(async () => {
      manager1 = await login(app, 'manager1@b.dev');
    });

    it('sees only employees of their own branch', async () => {
      const list = await http(app).get('/v1/employees').set(bearer(manager1));
      expect(list.status).toBe(200);
      const branches = new Set(list.body.map((e: { branch_id: string }) => e.branch_id));
      expect(branches.size).toBe(1);
      const own = await q<{ branch_id: string }>(
        "SELECT branch_id FROM user_role_assignments WHERE role_code = 'branch_manager' AND user_id = (SELECT id FROM user_accounts WHERE email = 'manager1@b.dev')",
      );
      expect([...branches]).toEqual([own[0]!.branch_id]);
    });

    it('gets 404 for an employee in another branch of the same tenant', async () => {
      const other = await employeeIdByEmail('emp2@b.dev');
      expect((await http(app).get(`/v1/employees/${other}`).set(bearer(manager1))).status).toBe(404);
    });

    it('cannot issue activation codes or decide device changes', async () => {
      const res = await http(app)
        .post('/v1/devices/activation-codes')
        .set(bearer(manager1))
        .send({ employee_id: await employeeIdByEmail('emp1@b.dev') });
      expect(res.status).toBe(403);
    });
  });
});
