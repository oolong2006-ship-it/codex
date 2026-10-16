-- 0003_capa.sql — Nonconformity, root-cause analysis, corrective action and effectiveness verification (P3).
-- Records here are evidence of implementation: timestamps of actions are server-side (no backdating),
-- analyses and verifications are append-only, and lifecycle transitions are enforced by trigger.

CREATE TABLE org_counters (
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key    text NOT NULL,
  value  int  NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, key)
);

CREATE TABLE nonconformities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  code            text NOT NULL,
  source          text NOT NULL CHECK (source IN ('CUSTOMER_COMPLAINT','INTERNAL_AUDIT','EXTERNAL_AUDIT','INSPECTION','SUPPLIER','PROCESS_MONITORING','EMPLOYEE_REPORT','OTHER')),
  severity        text NOT NULL CHECK (severity IN ('MINOR','MAJOR','CRITICAL')),
  process_code    text,
  site_id         uuid REFERENCES sites(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text NOT NULL,
  detected_on     date NOT NULL,
  reported_by     uuid NOT NULL REFERENCES users(id),
  reported_at     timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CONTAINED','ACTION_PLANNED','IMPLEMENTED','CLOSED')),
  cycle           int  NOT NULL DEFAULT 1,
  containment     text,
  containment_by  uuid REFERENCES users(id),
  containment_at  timestamptz,
  closure_type    text CHECK (closure_type IN ('EFFECTIVE_CAPA','CORRECTION_ONLY')),
  closure_note    text,
  closed_by       uuid REFERENCES users(id),
  closed_at       timestamptz,
  UNIQUE (org_id, code)
);
CREATE INDEX nonconformities_org_status_idx ON nonconformities (org_id, status);

CREATE TABLE nc_analyses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nc_id        uuid NOT NULL REFERENCES nonconformities(id) ON DELETE CASCADE,
  cycle        int  NOT NULL,
  method       text NOT NULL CHECK (method IN ('FIVE_WHYS','FISHBONE','OTHER')),
  whys         jsonb NOT NULL DEFAULT '[]',
  root_cause   text NOT NULL,
  analyzed_by  uuid NOT NULL REFERENCES users(id),
  analyzed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nc_id, cycle)
);

CREATE TABLE corrective_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nc_id           uuid NOT NULL REFERENCES nonconformities(id) ON DELETE CASCADE,
  cycle           int  NOT NULL,
  description     text NOT NULL,
  owner_id        uuid NOT NULL REFERENCES users(id),
  due_on          date NOT NULL,
  status          text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','DONE','CANCELLED')),
  completion_note text,
  completed_by    uuid REFERENCES users(id),
  completed_at    timestamptz,
  cancel_reason   text,
  created_by      uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX corrective_actions_nc_idx ON corrective_actions (nc_id);

CREATE TABLE effectiveness_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nc_id         uuid NOT NULL REFERENCES nonconformities(id) ON DELETE CASCADE,
  cycle         int  NOT NULL,
  result        text NOT NULL CHECK (result IN ('EFFECTIVE','INEFFECTIVE')),
  method        text NOT NULL,
  evidence_note text NOT NULL,
  performed_by  uuid NOT NULL REFERENCES users(id),
  performed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nc_id, cycle)
);

-- Lifecycle guard (defence in depth behind the domain layer).
CREATE OR REPLACE FUNCTION nonconformities_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'CLOSED' THEN
    RAISE EXCEPTION 'NC_CLOSED: a closed nonconformity is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (
       OLD.status = NEW.status
    OR (OLD.status = 'OPEN'           AND NEW.status = 'CONTAINED')
    OR (OLD.status = 'CONTAINED'      AND NEW.status IN ('ACTION_PLANNED','CLOSED'))
    OR (OLD.status = 'ACTION_PLANNED' AND NEW.status = 'IMPLEMENTED')
    OR (OLD.status = 'IMPLEMENTED'    AND NEW.status IN ('CLOSED','CONTAINED'))
  ) THEN
    RAISE EXCEPTION 'ILLEGAL_TRANSITION: % -> %', OLD.status, NEW.status USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'CLOSED' AND NEW.closure_type = 'CORRECTION_ONLY' AND NEW.severity <> 'MINOR' THEN
    RAISE EXCEPTION 'CAPA_REQUIRED: % nonconformity needs corrective action', NEW.severity USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'CLOSED' AND NEW.closure_type = 'EFFECTIVE_CAPA' AND NOT EXISTS (
       SELECT 1 FROM effectiveness_checks c WHERE c.nc_id = NEW.id AND c.cycle = NEW.cycle AND c.result = 'EFFECTIVE') THEN
    RAISE EXCEPTION 'EFFECTIVENESS_NOT_VERIFIED' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.detected_on > current_date THEN
    RAISE EXCEPTION 'FUTURE_DATE: detection date cannot be in the future' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nonconformities_guard BEFORE UPDATE ON nonconformities FOR EACH ROW EXECUTE FUNCTION nonconformities_guard();

CREATE OR REPLACE FUNCTION nonconformities_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'OPEN' THEN RAISE EXCEPTION 'NC must start OPEN' USING ERRCODE = 'P0001'; END IF;
  IF NEW.detected_on > current_date THEN
    RAISE EXCEPTION 'FUTURE_DATE: detection date cannot be in the future' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nonconformities_insert_guard BEFORE INSERT ON nonconformities FOR EACH ROW EXECUTE FUNCTION nonconformities_insert_guard();

-- A completed or cancelled action is final.
CREATE OR REPLACE FUNCTION corrective_actions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'PLANNED' THEN
    RAISE EXCEPTION 'ACTION_FINAL: % action cannot change', OLD.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER corrective_actions_guard BEFORE UPDATE ON corrective_actions FOR EACH ROW EXECUTE FUNCTION corrective_actions_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['org_counters','nonconformities','nc_analyses','corrective_actions','effectiveness_checks']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id())', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON org_counters, nonconformities, corrective_actions TO iso_app;
GRANT SELECT, INSERT ON nc_analyses, effectiveness_checks TO iso_app;   -- append-only evidence
