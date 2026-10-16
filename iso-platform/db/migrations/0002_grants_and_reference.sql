-- 0002 — least-privilege grants for the application role + reference data.
-- Role iso_app must exist (created by scripts/db-setup.sh).

GRANT USAGE ON SCHEMA public TO iso_app;

GRANT SELECT, INSERT, UPDATE ON users, sessions TO iso_app;
GRANT SELECT, INSERT ON login_attempts TO iso_app;
GRANT USAGE ON SEQUENCE login_attempts_id_seq TO iso_app;

-- Licensing registry is managed by the platform owner, read-only for the app.
GRANT SELECT ON standards, standard_editions, license_grants TO iso_app;

GRANT SELECT, INSERT, UPDATE ON organizations TO iso_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships, sites, projects, intake_sessions, answers, facts, processes, risks, controlled_documents TO iso_app;
GRANT SELECT, INSERT, UPDATE ON document_versions, jobs TO iso_app;

-- Append-only evidence trails: no UPDATE / DELETE for the app role.
GRANT SELECT, INSERT ON tenant_audit_logs, approvals, model_runs TO iso_app;
GRANT USAGE ON SEQUENCE tenant_audit_logs_id_seq TO iso_app;

-- Worker claim: crosses tenants by design, so it is a narrow SECURITY DEFINER
-- function that only returns (id, org_id, kind). All processing then runs under RLS.
CREATE OR REPLACE FUNCTION claim_next_job() RETURNS TABLE (id uuid, org_id uuid, kind text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE jobs j SET status = 'RUNNING', locked_at = now(), attempts = j.attempts + 1
  WHERE j.id = (
    SELECT q.id FROM jobs q
    WHERE q.status = 'QUEUED' AND q.run_after <= now()
    ORDER BY q.run_after
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING j.id, j.org_id, j.kind;
END $$;
REVOKE ALL ON FUNCTION claim_next_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_next_job() TO iso_app;

-- Reference data: ISO 9001. Verified 2026-10-16 via ISO catalogue entry (iso.org/standard/9001)
-- and certification-body notices. Transition end date is NOT confirmed (set by IAF) — left NULL.
INSERT INTO standards (code, title_en, title_ar, family) VALUES
  ('ISO9001', 'Quality management systems', 'نظم إدارة الجودة', 'QMS');

INSERT INTO standard_editions (standard_id, edition_label, status, published_on, transition_ends_on, transition_note, verified_at, verification_source, is_default)
SELECT id, '2026', 'PUBLISHED', DATE '2026-09-16', NULL,
       'IAF transition arrangements not yet confirmed; ~3 years by precedent (unverified).',
       DATE '2026-10-16', 'https://www.iso.org/standard/9001 (catalogue: stage 60.60, 2026-09); NSF/DQS/TÜV SÜD notices', true
FROM standards WHERE code = 'ISO9001';

INSERT INTO standard_editions (standard_id, edition_label, status, published_on, transition_ends_on, transition_note, verified_at, verification_source, is_default)
SELECT id, '2015', 'TRANSITION', DATE '2015-09-15', NULL,
       'Withdrawn by ISO on publication of the 2026 edition; existing certificates remain valid during IAF transition.',
       DATE '2026-10-16', 'Secondary sources (certification bodies), pending licensed confirmation', false
FROM standards WHERE code = 'ISO9001';
