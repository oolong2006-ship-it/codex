-- 0005 — الورديات: قوالب ثابتة بأيام وتوقيت محلي، وتعيين الموظف بنافذة صلاحية.
-- مرجع: phase-2 §4. التوقيت المحلي يُحوَّل بمنطقة العميل في التطبيق، لا هنا.

CREATE TABLE shift_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  start_time  text NOT NULL CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time    text NOT NULL CHECK (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND end_time <> start_time),
  days        integer[] NOT NULL CHECK (cardinality(days) BETWEEN 1 AND 7 AND days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]),
  status      text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE shift_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  employee_id       uuid NOT NULL REFERENCES employees(id),
  shift_template_id uuid NOT NULL REFERENCES shift_templates(id),
  valid_from        date NOT NULL,
  valid_to          date,
  created_by        uuid REFERENCES user_accounts(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX shift_assignments_tenant_employee_idx ON shift_assignments (tenant_id, employee_id, valid_from);

ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shift_templates
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shift_assignments
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());

GRANT SELECT, INSERT, UPDATE ON shift_templates, shift_assignments TO sa_app, sa_platform;

INSERT INTO permissions (code, description) VALUES ('shifts.manage', 'إدارة قوالب الورديات وتعيينها');
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('tenant_admin', 'shifts.manage'),
  ('hr', 'shifts.manage');
