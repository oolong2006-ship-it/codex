-- 0004 — فترات الحضور: قفل الشهر يمنع التعديل، وإعادة الفتح بصلاحية خاصة وسجل تدقيق (specs §F، F15).

CREATE TABLE payroll_periods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'LOCKED', 'EXPORTED')),
  locked_at       timestamptz,
  locked_by       uuid REFERENCES user_accounts(id),
  reopened_at     timestamptz,
  reopened_by     uuid REFERENCES user_accounts(id),
  reopen_reason   text CHECK (reopen_reason IS NULL OR char_length(reopen_reason) BETWEEN 3 AND 500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  UNIQUE (tenant_id, period_start)
);

ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payroll_periods
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
GRANT SELECT, INSERT, UPDATE ON payroll_periods TO sa_app, sa_platform;

INSERT INTO permissions (code, description) VALUES
  ('payroll.periods.lock', 'قفل فترة الحضور'),
  ('payroll.periods.reopen', 'إعادة فتح فترة مقفلة (صلاحية خاصة)');
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('tenant_admin', 'payroll.periods.lock'),
  ('hr', 'payroll.periods.lock'),
  ('tenant_admin', 'payroll.periods.reopen');
