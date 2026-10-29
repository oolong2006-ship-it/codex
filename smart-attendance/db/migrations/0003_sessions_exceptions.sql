-- 0003 — الجلسات المشتقة، وطلبات الاستثناءات، والتسويات (append-only).
-- مرجع: phase-2 §3 و§5، specs §F: التصحيح ينشئ تسوية ولا يعدّل الحدث الأصلي.

-- ── الجلسات: مشتقة، تُعاد بناؤها بالكامل من الأحداث والتسويات ─────────────
CREATE TABLE attendance_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  employee_id       uuid NOT NULL REFERENCES employees(id),
  business_date     date NOT NULL,
  status            text NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'INCOMPLETE')),
  started_at        timestamptz NOT NULL,
  ended_at          timestamptz,
  duration_minutes  integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  -- event:<id> أو adjustment:<id>؛ مرجعان نصيان لأن المصدر قد يكون أيّ الجدولين.
  start_ref         text NOT NULL,
  end_ref           text,
  built_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'CLOSED' OR (ended_at IS NOT NULL AND duration_minutes IS NOT NULL)),
  CHECK (status <> 'INCOMPLETE' OR duration_minutes IS NULL)
);
CREATE INDEX attendance_sessions_tenant_employee_date_idx ON attendance_sessions (tenant_id, employee_id, business_date);
CREATE INDEX attendance_sessions_tenant_date_idx ON attendance_sessions (tenant_id, business_date);

-- ── طلبات الاستثناء: على قرار PENDING/REJECTED، أو بصمة منسية ─────────────
CREATE TABLE attendance_exceptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  employee_id    uuid NOT NULL REFERENCES employees(id),
  kind           text NOT NULL CHECK (kind IN ('DECISION_OVERRIDE', 'MISSING_PUNCH')),
  event_id       uuid REFERENCES attendance_events(id),
  punch_type     text CHECK (punch_type IN ('CLOCK_IN', 'CLOCK_OUT')),
  punch_at       timestamptz,
  reason         text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  status         text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'APPROVED', 'REJECTED')),
  requested_by   uuid NOT NULL REFERENCES user_accounts(id),
  decided_by     uuid REFERENCES user_accounts(id),
  decided_at     timestamptz,
  decision_note  text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'DECISION_OVERRIDE' AND event_id IS NOT NULL AND punch_type IS NULL AND punch_at IS NULL)
    OR (kind = 'MISSING_PUNCH' AND event_id IS NULL AND punch_type IS NOT NULL AND punch_at IS NOT NULL)
  ),
  CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
-- طلب مفتوح واحد لكل حدث، واستثناء معتمد واحد لكل حدث.
CREATE UNIQUE INDEX attendance_exceptions_one_open_per_event
  ON attendance_exceptions (tenant_id, event_id) WHERE status = 'OPEN' AND event_id IS NOT NULL;
CREATE UNIQUE INDEX attendance_exceptions_one_approved_per_event
  ON attendance_exceptions (tenant_id, event_id) WHERE status = 'APPROVED' AND event_id IS NOT NULL;
CREATE INDEX attendance_exceptions_tenant_status_idx ON attendance_exceptions (tenant_id, status, created_at DESC);

-- ── التسويات: أثر الاعتماد، لا يُعدَّل أبدًا ───────────────────────────────
CREATE TABLE attendance_adjustments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  employee_id  uuid NOT NULL REFERENCES employees(id),
  exception_id uuid NOT NULL UNIQUE REFERENCES attendance_exceptions(id),
  effect       text NOT NULL CHECK (effect IN ('ACCEPT_EVENT', 'ADD_PUNCH')),
  event_id     uuid REFERENCES attendance_events(id),
  punch_type   text CHECK (punch_type IN ('CLOCK_IN', 'CLOCK_OUT')),
  punch_at     timestamptz,
  approved_by  uuid NOT NULL REFERENCES user_accounts(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (effect = 'ACCEPT_EVENT' AND event_id IS NOT NULL AND punch_type IS NULL AND punch_at IS NULL)
    OR (effect = 'ADD_PUNCH' AND event_id IS NULL AND punch_type IS NOT NULL AND punch_at IS NOT NULL)
  )
);
CREATE INDEX attendance_adjustments_tenant_employee_idx ON attendance_adjustments (tenant_id, employee_id);
CREATE TRIGGER attendance_adjustments_immutable BEFORE UPDATE OR DELETE ON attendance_adjustments
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ── RLS ────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_sessions', 'attendance_exceptions', 'attendance_adjustments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id())',
      t);
  END LOOP;
END $$;

-- الجلسات مشتقة: تُحذف وتُعاد كتابتها. الاستثناءات: تُنشأ ثم تُعتمد. التسويات: إضافة فقط.
GRANT SELECT, INSERT, DELETE ON attendance_sessions TO sa_app, sa_platform;
GRANT SELECT, INSERT, UPDATE ON attendance_exceptions TO sa_app, sa_platform;
GRANT SELECT, INSERT ON attendance_adjustments TO sa_app, sa_platform;

-- ── صلاحية اعتماد الاستثناءات ──────────────────────────────────────────────
INSERT INTO permissions (code, description) VALUES ('attendance.exceptions.decide', 'اعتماد الاستثناءات ورفضها');
INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('tenant_admin', 'attendance.exceptions.decide'),
  ('hr', 'attendance.exceptions.decide'),
  ('branch_manager', 'attendance.exceptions.decide');
