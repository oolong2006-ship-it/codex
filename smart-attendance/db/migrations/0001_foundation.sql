-- 0001 — الأساس: العملاء، والهوية، والصلاحيات، والمواقع، والأجهزة، والسياسات، والتدقيق.
-- مرجع: prompts/phase-1-foundation.md §3، specs §C و§F، ADR-0013.
-- الأدوار sa_app (يخضع لـ RLS) وsa_platform (BYPASSRLS) يُنشئها مشغل migrations قبل هذا الملف.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;

-- ── سياق العميل ─────────────────────────────────────────────────────────────
-- التطبيق يضبط app.tenant_id داخل كل معاملة (set_config(..., true)).
CREATE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- يمنع أي تعديل أو حذف (append-only / immutable).
CREATE FUNCTION forbid_mutation() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION '% on % is not allowed (append-only)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END
$$;

-- ── العملاء ─────────────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        citext NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_settings (
  tenant_id   uuid PRIMARY KEY REFERENCES tenants(id),
  locale      text NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar', 'en')),
  timezone    text NOT NULL DEFAULT 'Asia/Riyadh',
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE legal_entities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  name        text NOT NULL,
  cr_number   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legal_entities_tenant_idx ON legal_entities (tenant_id);

CREATE TABLE branches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  legal_entity_id  uuid REFERENCES legal_entities(id),
  name             text NOT NULL,
  code             text,
  status           text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX branches_tenant_idx ON branches (tenant_id);

CREATE TABLE departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  branch_id   uuid REFERENCES branches(id),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX departments_tenant_idx ON departments (tenant_id);

CREATE TABLE employees (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  employee_number  text NOT NULL,
  full_name        text NOT NULL,
  branch_id        uuid REFERENCES branches(id),
  department_id    uuid REFERENCES departments(id),
  status           text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- US-30 / ADR-0010: مفتاح المطابقة الخارجي.
  UNIQUE (tenant_id, employee_number)
);
CREATE INDEX employees_tenant_branch_idx ON employees (tenant_id, branch_id);

-- ── الهوية ──────────────────────────────────────────────────────────────────
-- tenant_id NULL = مسؤول منصة (يُدار عبر sa_platform فقط).
CREATE TABLE user_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid REFERENCES tenants(id),
  employee_id      uuid REFERENCES employees(id),
  email            citext UNIQUE,
  phone            text UNIQUE,
  password_hash    text NOT NULL,
  status           text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  mfa_secret_enc   text,
  mfa_enabled      boolean NOT NULL DEFAULT false,
  -- آخر خطوة TOTP مستخدمة: يمنع إعادة استخدام الرمز نفسه.
  mfa_last_step    bigint,
  failed_logins    integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX user_accounts_tenant_idx ON user_accounts (tenant_id);

CREATE TABLE roles (
  code         text PRIMARY KEY,
  description  text NOT NULL
);

CREATE TABLE permissions (
  code         text PRIMARY KEY,
  description  text NOT NULL
);

CREATE TABLE role_permissions (
  role_code        text NOT NULL REFERENCES roles(code),
  permission_code  text NOT NULL REFERENCES permissions(code),
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE user_role_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  user_id     uuid NOT NULL REFERENCES user_accounts(id),
  role_code   text NOT NULL REFERENCES roles(code) CHECK (role_code <> 'platform_admin'),
  -- ABAC: نطاق الفرع لمدير الفرع.
  branch_id   uuid REFERENCES branches(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (role_code <> 'branch_manager' OR branch_id IS NOT NULL)
);
CREATE UNIQUE INDEX user_role_assignments_uniq
  ON user_role_assignments (tenant_id, user_id, role_code, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'));

CREATE TABLE refresh_tokens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid REFERENCES tenants(id),
  user_id            uuid NOT NULL REFERENCES user_accounts(id),
  family_id          uuid NOT NULL,
  token_hash         text NOT NULL UNIQUE,
  device_binding_id  uuid,
  issued_at          timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  revoked_reason     text,
  replaced_by        uuid
);
CREATE INDEX refresh_tokens_tenant_user_idx ON refresh_tokens (tenant_id, user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- ── المواقع والأسيجة ────────────────────────────────────────────────────────
CREATE TABLE work_locations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  branch_id        uuid NOT NULL REFERENCES branches(id),
  name             text NOT NULL,
  code             text,
  -- ADR-0005
  assurance_level  text NOT NULL DEFAULT 'STANDARD' CHECK (assurance_level IN ('STANDARD', 'HIGH', 'STRICT')),
  status           text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX work_locations_tenant_branch_idx ON work_locations (tenant_id, branch_id);

CREATE TABLE geofences (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  work_location_id    uuid NOT NULL UNIQUE REFERENCES work_locations(id),
  current_version_id  uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX geofences_tenant_idx ON geofences (tenant_id);

-- كل تعديل سياج = نسخة جديدة؛ النسخ لا تُعدّل (الأحداث تشير لنسختها).
CREATE TABLE geofence_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  geofence_id  uuid NOT NULL REFERENCES geofences(id),
  version      integer NOT NULL CHECK (version > 0),
  kind         text NOT NULL CHECK (kind IN ('CIRCLE', 'POLYGON')),
  center       geography(Point, 4326),
  radius_m     numeric(10, 2),
  polygon      geography(Polygon, 4326),
  tolerance_m  numeric(10, 2) NOT NULL DEFAULT 0 CHECK (tolerance_m >= 0),
  created_by   uuid REFERENCES user_accounts(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (geofence_id, version),
  CHECK (
    (kind = 'CIRCLE' AND center IS NOT NULL AND radius_m > 0 AND polygon IS NULL)
    OR (kind = 'POLYGON' AND polygon IS NOT NULL AND center IS NULL AND radius_m IS NULL)
  ),
  CHECK (polygon IS NULL OR ST_IsValid(polygon::geometry))
);
CREATE INDEX geofence_versions_tenant_idx ON geofence_versions (tenant_id, geofence_id);
CREATE INDEX geofence_versions_center_gist ON geofence_versions USING gist (center);
CREATE INDEX geofence_versions_polygon_gist ON geofence_versions USING gist (polygon);
CREATE TRIGGER geofence_versions_immutable BEFORE UPDATE OR DELETE ON geofence_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

ALTER TABLE geofences ADD CONSTRAINT geofences_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES geofence_versions(id);

-- ── الأجهزة (DeviceLock — specs §C) ─────────────────────────────────────────
CREATE TABLE devices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  platform          text NOT NULL CHECK (platform IN ('ios', 'android')),
  key_id            text NOT NULL,
  public_key        text,
  -- إشارات تبقى بعد إعادة التثبيت (specs §C). لا معرّفات خام.
  android_id_hash   text,
  devicecheck_bit0  boolean,
  model             text,
  os_version        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, platform, key_id)
);
CREATE INDEX devices_tenant_idx ON devices (tenant_id);

CREATE TABLE device_bindings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  employee_id   uuid NOT NULL REFERENCES employees(id),
  device_id     uuid NOT NULL REFERENCES devices(id),
  status        text NOT NULL CHECK (status IN ('PENDING_ACTIVATION', 'ACTIVE', 'SUPERSEDED', 'REVOKED', 'SUSPENDED')),
  activated_at  timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- specs §C: ارتباط ACTIVE واحد فقط لكل موظف.
CREATE UNIQUE INDEX device_bindings_one_active
  ON device_bindings (tenant_id, employee_id) WHERE status = 'ACTIVE';
-- الجهاز نفسه لا يرتبط نشطًا بموظفين اثنين.
CREATE UNIQUE INDEX device_bindings_device_one_active
  ON device_bindings (tenant_id, device_id) WHERE status = 'ACTIVE';
CREATE INDEX device_bindings_tenant_employee_idx ON device_bindings (tenant_id, employee_id);

ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_binding_fk
  FOREIGN KEY (device_binding_id) REFERENCES device_bindings(id);

CREATE TABLE device_attestations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  device_id    uuid NOT NULL REFERENCES devices(id),
  platform     text NOT NULL CHECK (platform IN ('ios', 'android')),
  adapter      text NOT NULL,
  verified     boolean NOT NULL,
  -- نتيجة التحقق المختصرة فقط؛ لا تُخزن رموز أو شهادات خام.
  verdict      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_attestations_tenant_device_idx ON device_attestations (tenant_id, device_id);
CREATE TRIGGER device_attestations_immutable BEFORE UPDATE OR DELETE ON device_attestations
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE device_change_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  employee_id         uuid NOT NULL REFERENCES employees(id),
  current_binding_id  uuid REFERENCES device_bindings(id),
  new_device_id       uuid NOT NULL REFERENCES devices(id),
  reason              text NOT NULL CHECK (reason IN ('LOST', 'STOLEN', 'BROKEN', 'UPGRADE')),
  note                text,
  status              text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'APPROVED', 'REJECTED', 'EXPIRED')),
  requested_by        uuid NOT NULL REFERENCES user_accounts(id),
  decided_by          uuid REFERENCES user_accounts(id),
  decided_at          timestamptz,
  expires_at          timestamptz NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
CREATE UNIQUE INDEX device_change_requests_one_open
  ON device_change_requests (tenant_id, employee_id) WHERE status = 'OPEN';
CREATE INDEX device_change_requests_tenant_status_idx ON device_change_requests (tenant_id, status);

CREATE TABLE activation_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  employee_id  uuid NOT NULL REFERENCES employees(id),
  -- HMAC للرمز، لا الرمز نفسه.
  code_hash    text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  created_by   uuid NOT NULL REFERENCES user_accounts(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activation_codes_tenant_employee_idx ON activation_codes (tenant_id, employee_id);

-- تحدٍّ لمرة واحدة لربط الجهاز أو طلب تغييره (يمنع إعادة استخدام attestation).
CREATE TABLE attestation_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  user_id     uuid NOT NULL REFERENCES user_accounts(id),
  nonce_hash  text NOT NULL UNIQUE,
  purpose     text NOT NULL CHECK (purpose IN ('BIND', 'CHANGE')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attestation_challenges_tenant_user_idx ON attestation_challenges (tenant_id, user_id);

-- ── السياسات (CLAUDE.md §5.4: لا أرقام نظامية في الكود) ────────────────────
CREATE TABLE policies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  kind        text NOT NULL,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind)
);

CREATE TABLE policy_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  policy_id       uuid NOT NULL REFERENCES policies(id),
  version         integer NOT NULL CHECK (version > 0),
  effective_from  timestamptz NOT NULL,
  values          jsonb NOT NULL,
  created_by      uuid REFERENCES user_accounts(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, version)
);
CREATE INDEX policy_versions_effective_idx ON policy_versions (tenant_id, policy_id, effective_from DESC);
CREATE TRIGGER policy_versions_immutable BEFORE UPDATE OR DELETE ON policy_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ── التدقيق (specs §F) ──────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     uuid REFERENCES tenants(id),
  actor_type    text NOT NULL CHECK (actor_type IN ('user', 'platform_admin', 'system', 'api_client')),
  actor_id      uuid,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     text,
  before        jsonb,
  after         jsonb,
  ip            inet,
  user_agent    text,
  request_id    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_tenant_created_idx ON audit_logs (tenant_id, created_at DESC);
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- ── RLS: كل جدول تشغيلي ─────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_settings', 'legal_entities', 'branches', 'departments', 'employees',
    'user_accounts', 'user_role_assignments', 'refresh_tokens',
    'work_locations', 'geofences', 'geofence_versions',
    'devices', 'device_bindings', 'device_attestations', 'device_change_requests', 'activation_codes',
    'attestation_challenges', 'policies', 'policy_versions', 'audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      t);
  END LOOP;
END $$;

-- العميل يرى صفه فقط.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenants USING (id = app_tenant_id());

-- ── الصلاحيات على مستوى DB ─────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO sa_app, sa_platform;
GRANT SELECT ON roles, permissions, role_permissions TO sa_app, sa_platform;
GRANT SELECT ON tenants TO sa_app;
GRANT SELECT, INSERT, UPDATE ON tenants TO sa_platform;

-- لا DELETE على سجلات الهوية والأجهزة: التاريخ يبقى، والتغيير بالحالة.
GRANT SELECT, INSERT, UPDATE ON
  tenant_settings, legal_entities, branches, departments, employees,
  user_accounts, user_role_assignments, refresh_tokens,
  work_locations, geofences, devices, device_bindings, device_change_requests, activation_codes,
  attestation_challenges, policies
TO sa_app, sa_platform;
GRANT DELETE ON user_role_assignments TO sa_app, sa_platform;

-- جداول append-only: قراءة وإضافة فقط.
GRANT SELECT, INSERT ON geofence_versions, device_attestations, policy_versions, audit_logs TO sa_app, sa_platform;

-- ── دوال الدخول قبل معرفة العميل (SECURITY DEFINER، أقل قدر من الحقول) ────
CREATE FUNCTION auth_find_user(p_identifier text)
RETURNS TABLE (id uuid, tenant_id uuid, password_hash text, status text,
               mfa_enabled boolean, failed_logins integer, locked_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT u.id, u.tenant_id, u.password_hash, u.status, u.mfa_enabled, u.failed_logins, u.locked_until
  FROM user_accounts u
  WHERE u.email = p_identifier::citext OR u.phone = p_identifier
  LIMIT 1
$$;

CREATE FUNCTION auth_find_refresh(p_token_hash text)
RETURNS TABLE (id uuid, tenant_id uuid, user_id uuid, family_id uuid,
               expires_at timestamptz, revoked_at timestamptz, replaced_by uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
$$
  SELECT r.id, r.tenant_id, r.user_id, r.family_id, r.expires_at, r.revoked_at, r.replaced_by
  FROM refresh_tokens r WHERE r.token_hash = p_token_hash
$$;

REVOKE ALL ON FUNCTION auth_find_user(text), auth_find_refresh(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_find_user(text), auth_find_refresh(text) TO sa_app, sa_platform;
GRANT EXECUTE ON FUNCTION app_tenant_id() TO sa_app, sa_platform;

-- ── البيانات المرجعية ──────────────────────────────────────────────────────
INSERT INTO roles (code, description) VALUES
  ('platform_admin', 'Super Admin للمنصة'),
  ('tenant_admin', 'مسؤول العميل'),
  ('hr', 'الموارد البشرية'),
  ('branch_manager', 'مدير فرع (بنطاق فروعه)'),
  ('employee', 'موظف');

INSERT INTO permissions (code, description) VALUES
  ('tenants.manage', 'إنشاء العملاء وإدارتهم'),
  ('employees.read', 'قراءة الموظفين'),
  ('employees.write', 'إضافة الموظفين وتعديلهم'),
  ('branches.read', 'قراءة الفروع'),
  ('branches.write', 'إدارة الفروع والمواقع'),
  ('devices.activation.issue', 'إصدار رموز التفعيل'),
  ('devices.change.decide', 'اعتماد طلبات تغيير الجهاز أو رفضها'),
  ('devices.binding.suspend', 'إيقاف ارتباط جهاز'),
  ('devices.binding.reactivate', 'إعادة تفعيل ارتباط موقوف'),
  ('devices.read', 'قراءة الأجهزة والارتباطات'),
  ('devices.self', 'ربط جهازي وطلب تغييره'),
  ('audit.read', 'قراءة سجل التدقيق');

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('platform_admin', 'tenants.manage'),
  ('tenant_admin', 'employees.read'), ('tenant_admin', 'employees.write'),
  ('tenant_admin', 'branches.read'), ('tenant_admin', 'branches.write'),
  ('tenant_admin', 'devices.activation.issue'), ('tenant_admin', 'devices.change.decide'),
  ('tenant_admin', 'devices.binding.suspend'), ('tenant_admin', 'devices.read'),
  ('tenant_admin', 'audit.read'),
  ('hr', 'employees.read'), ('hr', 'employees.write'), ('hr', 'branches.read'),
  ('hr', 'devices.activation.issue'), ('hr', 'devices.change.decide'),
  ('hr', 'devices.binding.suspend'), ('hr', 'devices.binding.reactivate'),
  ('hr', 'devices.read'), ('hr', 'audit.read'),
  ('branch_manager', 'employees.read'), ('branch_manager', 'branches.read'),
  ('branch_manager', 'devices.read'),
  ('employee', 'devices.self');
