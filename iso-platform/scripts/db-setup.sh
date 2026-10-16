#!/usr/bin/env bash
# Creates roles and databases for local development / CI. Requires a superuser connection.
# Usage: PGSUPER_URL=postgresql://postgres@localhost/postgres bash scripts/db-setup.sh
set -euo pipefail
SUPER="${PGSUPER_URL:-postgresql://postgres@localhost:5432/postgres}"
APP_PW="${ISO_APP_PASSWORD:-iso_app_dev}"
OWNER_PW="${ISO_OWNER_PASSWORD:-iso_owner_dev}"

psql "$SUPER" -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iso_owner') THEN
    CREATE ROLE iso_owner LOGIN PASSWORD '${OWNER_PW}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iso_app') THEN
    CREATE ROLE iso_app LOGIN PASSWORD '${APP_PW}' NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END \$\$;
SQL

for DB in iso_platform iso_platform_test; do
  if ! psql "$SUPER" -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1; then
    psql "$SUPER" -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB} OWNER iso_owner"
  fi
done
echo "roles + databases ready"
