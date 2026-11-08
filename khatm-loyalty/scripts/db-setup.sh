#!/usr/bin/env bash
# Creates the khatm role + database on a local/CI Postgres. Idempotent.
set -euo pipefail
SUPER="${PGSUPER_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
psql "$SUPER" -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khatm') THEN
    CREATE ROLE khatm LOGIN PASSWORD 'khatm_dev';
  END IF;
END $$;
SQL
for db in khatm khatm_test; do
  if ! psql "$SUPER" -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -q 1; then
    psql "$SUPER" -q -c "CREATE DATABASE $db OWNER khatm"
  fi
done
echo "db-setup: role khatm, databases khatm + khatm_test ready"
