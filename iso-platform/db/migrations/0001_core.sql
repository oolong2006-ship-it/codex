-- 0001_core.sql — Common Management System Core (P1)
-- Tenant isolation: every tenant table carries org_id and is protected by RLS.
-- The application connects as role iso_app (NOBYPASSRLS, not table owner).
-- Each request runs in a transaction with app.org_id / app.user_id set LOCAL.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION app_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- ───────────────────────── Global (non-tenant) tables ─────────────────────────

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  full_name     text NOT NULL,
  password_hash text NOT NULL,
  locale        text NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar','en')),
  mfa_enabled   boolean NOT NULL DEFAULT false,
  must_change_password boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_org_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE login_attempts (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL,
  ip         text,
  success    boolean NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_at_idx ON login_attempts (lower(email), at DESC);

-- Standards & licensing registry (platform-managed, read-only for tenants)
CREATE TABLE standards (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code      text NOT NULL UNIQUE,            -- e.g. ISO9001
  title_en  text NOT NULL,
  title_ar  text NOT NULL,
  family    text NOT NULL                    -- QMS, EMS, OHSMS, ISMS, FSMS
);

CREATE TABLE standard_editions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id         uuid NOT NULL REFERENCES standards(id),
  edition_label       text NOT NULL,         -- e.g. 2026
  status              text NOT NULL CHECK (status IN ('PUBLISHED','WITHDRAWN','DRAFT','TRANSITION')),
  published_on        date,
  transition_ends_on  date,
  transition_note     text,
  verified_at         date NOT NULL,
  verification_source text NOT NULL,
  is_default          boolean NOT NULL DEFAULT false,
  UNIQUE (standard_id, edition_label)
);

CREATE TABLE license_grants (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_edition_id  uuid NOT NULL REFERENCES standard_editions(id),
  licensor             text NOT NULL,
  license_ref          text NOT NULL,
  scope                text NOT NULL,
  ai_processing_allowed boolean NOT NULL DEFAULT false,
  max_users            int,
  countries            text[] NOT NULL DEFAULT '{}',
  valid_from           date NOT NULL,
  valid_to             date,
  status               text NOT NULL CHECK (status IN ('PENDING_VERIFICATION','ACTIVE','EXPIRED','REVOKED')),
  verified_by          text,
  verified_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────── Tenant tables ─────────────────────────────

CREATE TABLE organizations (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  legal_name    text,
  country       text NOT NULL DEFAULT 'SA',
  industry_code text NOT NULL,
  size_band     text NOT NULL CHECK (size_band IN ('MICRO','SMALL','MEDIUM','LARGE')),
  description   text,
  logo_url      text,
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('OWNER','QUALITY_MANAGER','CONTRIBUTOR','AUDITOR','VIEWER')),
  job_title  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);

CREATE TABLE sites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       text NOT NULL,
  city       text,
  country    text NOT NULL DEFAULT 'SA',
  address    text,
  activities text,
  headcount  int CHECK (headcount IS NULL OR headcount >= 0),
  is_head_office boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sites_org_idx ON sites (org_id);

CREATE TABLE tenant_audit_logs (
  id          bigserial PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenant_audit_logs_org_at_idx ON tenant_audit_logs (org_id, at DESC);

CREATE TABLE projects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  standard_edition_id uuid NOT NULL REFERENCES standard_editions(id),
  title               text NOT NULL,
  status              text NOT NULL DEFAULT 'INTAKE'
                      CHECK (status IN ('INTAKE','BLUEPRINT','SCOPE_APPROVED','DOCUMENTING','OPERATING','ARCHIVED')),
  site_ids            uuid[] NOT NULL DEFAULT '{}',
  scope_statement     text,
  scope_approved_by   uuid REFERENCES users(id),
  scope_approved_at   timestamptz,
  blueprint           jsonb,
  blueprint_version   int NOT NULL DEFAULT 0,
  created_by          uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_org_idx ON projects (org_id);

CREATE TABLE intake_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  industry_code text NOT NULL,
  status        text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','COMPLETED')),
  started_by    uuid NOT NULL REFERENCES users(id),
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  UNIQUE (project_id)
);

-- Provenance statuses used across facts and generated content.
CREATE TYPE provenance AS ENUM ('VERIFIED','CLIENT_PROVIDED','INFERRED','MISSING','CONFLICTED','NOT_APPLICABLE');

CREATE TABLE answers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  intake_session_id uuid NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
  question_id       text NOT NULL,
  value             jsonb NOT NULL,
  answered_by       uuid NOT NULL REFERENCES users(id),
  answered_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intake_session_id, question_id)
);

CREATE TABLE facts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key         text NOT NULL,
  value       jsonb,
  status      provenance NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('INTERVIEW','DOCUMENT','RULE','REVIEWER','SYSTEM')),
  source_ref  text,
  note        text,
  owner_id    uuid REFERENCES users(id),
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

CREATE TABLE processes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code        text NOT NULL,
  name_ar     text NOT NULL,
  name_en     text NOT NULL,
  category    text NOT NULL CHECK (category IN ('MANAGEMENT','CORE','SUPPORT')),
  owner_role  text,
  inputs      jsonb NOT NULL DEFAULT '[]',
  outputs     jsonb NOT NULL DEFAULT '[]',
  kpis        jsonb NOT NULL DEFAULT '[]',
  provenance  provenance NOT NULL DEFAULT 'INFERRED',
  rationale   text,
  sort_order  int NOT NULL DEFAULT 0,
  UNIQUE (project_id, code)
);

CREATE TABLE risks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  process_code text,
  kind         text NOT NULL CHECK (kind IN ('RISK','OPPORTUNITY')),
  title        text NOT NULL,
  description  text,
  likelihood   int CHECK (likelihood BETWEEN 1 AND 5),
  impact       int CHECK (impact BETWEEN 1 AND 5),
  score        int GENERATED ALWAYS AS (coalesce(likelihood,0) * coalesce(impact,0)) STORED,
  treatment    text,
  status       text NOT NULL DEFAULT 'HYPOTHESIS' CHECK (status IN ('HYPOTHESIS','CONFIRMED','TREATING','CLOSED','REJECTED')),
  provenance   provenance NOT NULL DEFAULT 'INFERRED',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX risks_project_idx ON risks (project_id);

-- Controlled documents: numbered, versioned, lifecycle-governed.
CREATE TABLE controlled_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code           text NOT NULL,
  doc_type       text NOT NULL CHECK (doc_type IN ('SCOPE','POLICY','OBJECTIVES','PROCEDURE','WORK_INSTRUCTION','PROCESS_MAP','RACI','RISK_REGISTER','FORM','PLAN','MANUAL','REPORT')),
  title          text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('REQUIRED_VERIFIED','REQUIRED_UNVERIFIED','SUGGESTED','OPTIONAL')),
  classification_basis text NOT NULL,
  domain_code    text,
  process_code   text,
  owner_id       uuid REFERENCES users(id),
  status         text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','EFFECTIVE','ARCHIVED')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE document_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id    uuid NOT NULL REFERENCES controlled_documents(id) ON DELETE CASCADE,
  version_no     int NOT NULL,
  status         text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','EFFECTIVE','SUPERSEDED','REJECTED')),
  content        jsonb NOT NULL,
  content_sha256 text NOT NULL,
  change_summary text NOT NULL,
  generated_by   text NOT NULL,          -- 'rules:v1', 'ai:<provider>/<model>@<prompt_version>', 'human'
  author_id      uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  submitted_at   timestamptz,
  approved_by    uuid REFERENCES users(id),
  approved_at    timestamptz,
  effective_at   timestamptz,
  superseded_at  timestamptz,
  UNIQUE (document_id, version_no)
);

CREATE TABLE approvals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  actor_id            uuid NOT NULL REFERENCES users(id),
  decision            text NOT NULL CHECK (decision IN ('SUBMITTED','APPROVED','REJECTED','MADE_EFFECTIVE')),
  comment             text,
  at                  timestamptz NOT NULL DEFAULT now()
);

-- Durable background jobs (Postgres queue, SKIP LOCKED).
CREATE TABLE jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','DEAD')),
  attempts    int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  run_after   timestamptz NOT NULL DEFAULT now(),
  locked_at   timestamptz,
  last_error  text,
  result      jsonb,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX jobs_ready_idx ON jobs (status, run_after);

CREATE TABLE model_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_type      text NOT NULL,
  provider       text NOT NULL,
  model          text NOT NULL,
  prompt_version text NOT NULL,
  input_tokens   int NOT NULL DEFAULT 0,
  output_tokens  int NOT NULL DEFAULT 0,
  cost_usd       numeric(12,6) NOT NULL DEFAULT 0,
  status         text NOT NULL CHECK (status IN ('SUCCEEDED','FAILED','REJECTED_BY_VALIDATOR')),
  error_code     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────── Integrity triggers ─────────────────────────────

-- Content of a version is immutable once it leaves DRAFT. Status may move forward only.
CREATE OR REPLACE FUNCTION document_versions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (NEW.content IS DISTINCT FROM OLD.content OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256) THEN
    RAISE EXCEPTION 'IMMUTABLE_VERSION: content of a % version cannot change', OLD.status USING ERRCODE = 'P0001';
  END IF;
  IF NOT (
       OLD.status = NEW.status
    OR (OLD.status = 'DRAFT'     AND NEW.status = 'IN_REVIEW')
    OR (OLD.status = 'IN_REVIEW' AND NEW.status IN ('APPROVED','REJECTED','DRAFT'))
    OR (OLD.status = 'APPROVED'  AND NEW.status = 'EFFECTIVE')
    OR (OLD.status = 'EFFECTIVE' AND NEW.status = 'SUPERSEDED')
  ) THEN
    RAISE EXCEPTION 'ILLEGAL_TRANSITION: % -> %', OLD.status, NEW.status USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'APPROVED' AND NEW.approved_by = NEW.author_id THEN
    RAISE EXCEPTION 'SEGREGATION_OF_DUTIES: author cannot approve own version' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_versions_guard BEFORE UPDATE ON document_versions
  FOR EACH ROW EXECUTE FUNCTION document_versions_guard();

-- ───────────────────────────── Row-level security ─────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sites','tenant_audit_logs','projects','intake_sessions','answers','facts',
                           'processes','risks','controlled_documents','document_versions','approvals','jobs','model_runs']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id())', t);
  END LOOP;
END $$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_member_read ON organizations FOR SELECT
  USING (id = app_org_id() OR EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = organizations.id AND m.user_id = app_user_id()));
CREATE POLICY org_insert ON organizations FOR INSERT WITH CHECK (id = app_org_id() AND created_by = app_user_id());
CREATE POLICY org_update ON organizations FOR UPDATE USING (id = app_org_id()) WITH CHECK (id = app_org_id());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_read ON memberships FOR SELECT USING (org_id = app_org_id() OR user_id = app_user_id());
CREATE POLICY membership_write ON memberships FOR INSERT WITH CHECK (org_id = app_org_id());
CREATE POLICY membership_update ON memberships FOR UPDATE USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
CREATE POLICY membership_delete ON memberships FOR DELETE USING (org_id = app_org_id());
