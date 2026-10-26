import { employeeIdByEmail, q, tenantId, withDb } from './helpers';

/** قيود قاعدة البيانات نفسها، بغض النظر عن الخدمة. */
describe('database guarantees', () => {
  it('one ACTIVE binding per employee is enforced by the database', async () => {
    const tenant = await tenantId('tenant-b');
    const employee = await employeeIdByEmail('manager2@b.dev');
    const devices = await q<{ id: string }>(
      `INSERT INTO devices (tenant_id, platform, key_id) VALUES ($1, 'ios', 'dbc-1'), ($1, 'ios', 'dbc-2') RETURNING id`,
      [tenant],
    );
    await q("INSERT INTO device_bindings (tenant_id, employee_id, device_id, status) VALUES ($1, $2, $3, 'ACTIVE')", [
      tenant,
      employee,
      devices[0]!.id,
    ]);
    await expect(
      q("INSERT INTO device_bindings (tenant_id, employee_id, device_id, status) VALUES ($1, $2, $3, 'ACTIVE')", [
        tenant,
        employee,
        devices[1]!.id,
      ]),
    ).rejects.toThrow(/device_bindings_one_active/);
    // غير النشط مسموح بجانبه
    await q("INSERT INTO device_bindings (tenant_id, employee_id, device_id, status) VALUES ($1, $2, $3, 'SUPERSEDED')", [
      tenant,
      employee,
      devices[1]!.id,
    ]);
  });

  describe('F16 — audit_logs is append-only', () => {
    it('UPDATE and DELETE fail on the trigger even for the schema owner', async () => {
      await withDb('owner', async (c) => {
        await c.query("INSERT INTO audit_logs (actor_type, action, entity_type) VALUES ('system', 'test.f16', 'test')");
        await expect(c.query("UPDATE audit_logs SET action = 'tampered' WHERE action = 'test.f16'")).rejects.toThrow(/append-only/);
        await expect(c.query("DELETE FROM audit_logs WHERE action = 'test.f16'")).rejects.toThrow(/append-only/);
        await expect(c.query('TRUNCATE audit_logs')).rejects.toThrow(/append-only/);
        const still = await c.query("SELECT 1 FROM audit_logs WHERE action = 'test.f16'");
        expect(still.rowCount).toBe(1);
      });
    });

    it('the application roles have no UPDATE or DELETE privilege on it', async () => {
      for (const role of ['app', 'platform'] as const) {
        await withDb(role, async (c) => {
          await expect(c.query("UPDATE audit_logs SET action = 'x'")).rejects.toThrow(/permission denied/);
          await expect(c.query('DELETE FROM audit_logs')).rejects.toThrow(/permission denied/);
        });
      }
    });
  });

  it('geofence and policy versions are immutable', async () => {
    const tenant = await tenantId('tenant-a');
    await withDb('owner', async (c) => {
      const branch = (await c.query('SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1', [tenant])).rows[0].id;
      const loc = (
        await c.query("INSERT INTO work_locations (tenant_id, branch_id, name) VALUES ($1, $2, 'موقع') RETURNING id", [tenant, branch])
      ).rows[0].id;
      const gf = (await c.query('INSERT INTO geofences (tenant_id, work_location_id) VALUES ($1, $2) RETURNING id', [tenant, loc])).rows[0].id;
      const v = (
        await c.query(
          "INSERT INTO geofence_versions (tenant_id, geofence_id, version, kind, center, radius_m) VALUES ($1, $2, 1, 'CIRCLE', 'SRID=4326;POINT(46.6753 24.7136)', 50) RETURNING id",
          [tenant, gf],
        )
      ).rows[0].id;
      await expect(c.query('UPDATE geofence_versions SET radius_m = 500 WHERE id = $1', [v])).rejects.toThrow(/append-only/);
      await expect(c.query('UPDATE policy_versions SET values = $1', ['{}'])).rejects.toThrow(/append-only/);
    });
  });

  it('rejects a self-intersecting polygon geofence', async () => {
    const tenant = await tenantId('tenant-a');
    await withDb('owner', async (c) => {
      const gf = (await c.query('SELECT id FROM geofences WHERE tenant_id = $1 LIMIT 1', [tenant])).rows[0].id;
      await expect(
        c.query(
          "INSERT INTO geofence_versions (tenant_id, geofence_id, version, kind, polygon) VALUES ($1, $2, 2, 'POLYGON', 'SRID=4326;POLYGON((46.0 24.0, 46.1 24.1, 46.1 24.0, 46.0 24.1, 46.0 24.0))')",
          [tenant, gf],
        ),
      ).rejects.toThrow(/check constraint/);
    });
  });

  it('a change request cannot be decided by its requester (DB check)', async () => {
    const tenant = await tenantId('tenant-b');
    const employee = await employeeIdByEmail('emp2@b.dev');
    const user = (await q<{ id: string }>("SELECT id FROM user_accounts WHERE email = 'emp2@b.dev'"))[0]!.id;
    const device = (await q<{ id: string }>("INSERT INTO devices (tenant_id, platform, key_id) VALUES ($1, 'android', 'dbc-self') RETURNING id", [tenant]))[0]!.id;
    await expect(
      q(
        `INSERT INTO device_change_requests (tenant_id, employee_id, new_device_id, reason, requested_by, decided_by, status, expires_at)
         VALUES ($1, $2, $3, 'LOST', $4, $4, 'APPROVED', now() + interval '1 day')`,
        [tenant, employee, device, user],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
