-- 0002 — نواة البصمة: التفويض بالمواقع، والتحديات، والأحداث append-only، والقرارات، والأدلة، وidempotency.
-- مرجع: specs §A، §B، §D، §F، §H؛ ADR-0002/0003/0005.

-- ── إعدادات الموقع الإضافية (ADR-0002/0003) ───────────────────────────────
ALTER TABLE work_locations
  ADD COLUMN wifi_uplift_enabled boolean NOT NULL DEFAULT false,
  -- HMAC لشبكات الفرع (لا BSSID خام أبدًا — F40).
  ADD COLUMN known_bssid_hashes text[] NOT NULL DEFAULT '{}';

-- ── تفويض الموظف بالمواقع (US-05) ─────────────────────────────────────────
CREATE TABLE employee_site_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  employee_id       uuid NOT NULL REFERENCES employees(id),
  work_location_id  uuid NOT NULL REFERENCES work_locations(id),
  valid_from        timestamptz NOT NULL DEFAULT now(),
  valid_to          timestamptz,
  created_by        uuid REFERENCES user_accounts(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);
CREATE INDEX employee_site_assignments_tenant_employee_idx ON employee_site_assignments (tenant_id, employee_id);

-- ── تحدي البصمة (specs §D.1) ──────────────────────────────────────────────
-- nonce يُخزن لأنه جزء من البيانات الموقّعة؛ قيمته تنتهي بعد استخدامه أو انتهاء صلاحيته.
CREATE TABLE attendance_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  user_id      uuid NOT NULL REFERENCES user_accounts(id),
  nonce        text NOT NULL UNIQUE,
  issued_at    timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz
);
CREATE INDEX attendance_challenges_tenant_user_idx ON attendance_challenges (tenant_id, user_id);

-- ── الأحداث (specs §F: append-only؛ يُستثنى synced_at) ─────────────────────
CREATE TABLE attendance_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  employee_id        uuid NOT NULL REFERENCES employees(id),
  user_id            uuid NOT NULL REFERENCES user_accounts(id),
  type               text NOT NULL CHECK (type IN ('CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END')),
  server_time        timestamptz NOT NULL DEFAULT now(),
  client_time        timestamptz,
  client_tz          text,
  device_id          uuid REFERENCES devices(id),
  device_binding_id  uuid REFERENCES device_bindings(id),
  challenge_id       uuid REFERENCES attendance_challenges(id),
  app_version        text,
  os                 text,
  os_version         text,
  offline            boolean NOT NULL DEFAULT false,
  synced_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_events_tenant_employee_time_idx ON attendance_events (tenant_id, employee_id, server_time DESC);
CREATE INDEX attendance_events_tenant_device_time_idx ON attendance_events (tenant_id, device_id, server_time DESC);

CREATE FUNCTION attendance_events_guard() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DELETE on attendance_events is not allowed (append-only)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- الاستثناء الوحيد: synced_at.
  IF (to_jsonb(NEW) - 'synced_at') IS DISTINCT FROM (to_jsonb(OLD) - 'synced_at') THEN
    RAISE EXCEPTION 'UPDATE on attendance_events is not allowed (append-only)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER attendance_events_append_only BEFORE UPDATE OR DELETE ON attendance_events
  FOR EACH ROW EXECUTE FUNCTION attendance_events_guard();
CREATE TRIGGER attendance_events_no_truncate BEFORE TRUNCATE ON attendance_events
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- ── القرار المخزّن (specs §A الناتج + §H1) ─────────────────────────────────
CREATE TABLE attendance_decisions (
  event_id                 uuid PRIMARY KEY REFERENCES attendance_events(id),
  tenant_id                uuid NOT NULL REFERENCES tenants(id),
  decision                 text NOT NULL CHECK (decision IN ('VERIFIED', 'PENDING_REVIEW', 'REJECTED')),
  reasons                  text[] NOT NULL,
  signals                  text[] NOT NULL DEFAULT '{}',
  next_action              text NOT NULL,
  work_location_id         uuid REFERENCES work_locations(id),
  geofence_version_id      uuid REFERENCES geofence_versions(id),
  assurance_level          text,
  risk_points              numeric NOT NULL DEFAULT 0,
  support_points           numeric NOT NULL DEFAULT 0,
  policy_version_id        uuid NOT NULL REFERENCES policy_versions(id),
  attendance_policy_version_id uuid NOT NULL REFERENCES policy_versions(id),
  calibration_snapshot_id  uuid,
  engine_version           text NOT NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_decisions_tenant_decision_idx ON attendance_decisions (tenant_id, decision, created_at DESC);
CREATE TRIGGER attendance_decisions_immutable BEFORE UPDATE OR DELETE ON attendance_decisions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ── أدلة الموقع (specs §B) ─────────────────────────────────────────────────
CREATE TABLE location_evidence (
  event_id             uuid PRIMARY KEY REFERENCES attendance_events(id),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  samples              jsonb NOT NULL,
  chosen_index         integer,
  chosen_point         geography(Point, 4326),
  chosen_accuracy_m    numeric,
  signed_distance_m    numeric,
  geofence_version_id  uuid REFERENCES geofence_versions(id),
  accuracy_authorization text,
  wifi_connected_bssid_hash text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX location_evidence_tenant_idx ON location_evidence (tenant_id);
CREATE TRIGGER location_evidence_immutable BEFORE UPDATE OR DELETE ON location_evidence
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ── Idempotency (specs §D: نفس المفتاح = نفس الرد، 24 ساعة) ────────────────
CREATE TABLE idempotency_keys (
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  user_id       uuid NOT NULL REFERENCES user_accounts(id),
  key           uuid NOT NULL,
  request_hash  text NOT NULL,
  status_code   integer NOT NULL,
  response      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, user_id, key)
);

-- ── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employee_site_assignments', 'attendance_challenges', 'attendance_events',
    'attendance_decisions', 'location_evidence', 'idempotency_keys'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON employee_site_assignments, attendance_challenges, idempotency_keys TO sa_app, sa_platform;
GRANT DELETE ON idempotency_keys TO sa_app, sa_platform;
-- الأحداث: إضافة، وتحديث synced_at فقط (الـ trigger يفرض ذلك).
GRANT SELECT, INSERT ON attendance_events, attendance_decisions, location_evidence TO sa_app, sa_platform;
GRANT UPDATE (synced_at) ON attendance_events TO sa_app, sa_platform;

-- ── صلاحيات جديدة ─────────────────────────────────────────────────────────
INSERT INTO permissions (code, description) VALUES
  ('attendance.punch', 'تسجيل بصمتي'),
  ('attendance.read', 'قراءة الحضور والأدلة'),
  ('sites.assign', 'تفويض الموظفين بالمواقع');
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('employee', 'attendance.punch'),
  ('tenant_admin', 'attendance.read'), ('hr', 'attendance.read'), ('branch_manager', 'attendance.read'),
  ('tenant_admin', 'sites.assign'), ('hr', 'sites.assign');
-- HR يدير المواقع والأسيجة (phase-2: «للـ HR: … المواقع»).
INSERT INTO role_permissions (role_code, permission_code) VALUES ('hr', 'branches.write');
