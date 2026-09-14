#!/usr/bin/env bash
# تقرير حالة قاعدة البيانات الحيّة.
#   DATABASE_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres" \
#   ./scripts/inspect-schema.sh > schema-report.txt
#
# سلسلة الاتصال من:
#   Supabase Dashboard → Project Settings → Database → Connection string
set -euo pipefail
: "${DATABASE_URL:?يجب ضبط DATABASE_URL}"
exec psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$(dirname "$0")/../supabase/tools/inspect-schema.sql"
