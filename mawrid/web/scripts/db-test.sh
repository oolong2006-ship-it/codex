#!/usr/bin/env bash
# =====================================================================
# تشغيل مجموعة اختبارات قاعدة البيانات على PostgreSQL محلي
#   ./scripts/db-test.sh
# يعيد بناء قاعدة اختبار نظيفة، يطبّق الهجرات، ثم ينفّذ الاختبارات.
# لا يمس قاعدة الإنتاج إطلاقًا.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
BASE="${PGTEST_DIR:-/var/lib/postgresql/mawrid-test}"
PORT="${PGTEST_PORT:-54398}"
DB=mawrid_test
PSQL=(psql -h "$BASE/run" -p "$PORT" -U postgres)
# في CI: خادم PostgreSQL جاهز (حاوية خدمة) عبر PGHOST/PGPORT/PGUSER/PGPASSWORD
if [ -n "${PGHOST:-}" ]; then PSQL=(psql); fi

if [ -z "${PGHOST:-}" ] && ! "${PSQL[@]}" -d postgres -tAc 'select 1' >/dev/null 2>&1; then
  echo "▶ تشغيل خادم PostgreSQL محلي للاختبار…"
  mkdir -p "$BASE/data" "$BASE/run"; chown -R postgres:postgres "$BASE"
  [ -f "$BASE/data/PG_VERSION" ] || su postgres -s /bin/bash -c \
    "$PGBIN/initdb -D $BASE/data -U postgres --locale=C --encoding=UTF8" >/dev/null
  su postgres -s /bin/bash -c \
    "$PGBIN/pg_ctl -D $BASE/data -o '-p $PORT -k $BASE/run -c listen_addresses=' -l $BASE/pg.log start -w" >/dev/null
fi

echo "▶ إعادة بناء قاعدة الاختبار…"
"${PSQL[@]}" -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;"

run() { "${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null; }

echo "▶ محاكاة بيئة Supabase…"; run supabase/tests/00_supabase_shim.sql
echo "▶ تطبيق الهجرات…"
for f in supabase/migrations/*.sql; do run "$f"; done
echo "▶ إعادة تطبيق الهجرات (فحص التكرار)…"
for f in supabase/migrations/*.sql; do run "$f"; done
echo "▶ تحميل بيانات الاختبار…"; run supabase/tests/10_fixtures.sql

echo "▶ تنفيذ الاختبارات…"
FAILED=0
for t in supabase/tests/[2-9]*.sql; do
  out=$("${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 -f "$t" 2>&1) || FAILED=1
  echo "$out" | grep -E '(PASS|FAIL|ERROR)' | sed 's/^NOTICE:  //' | sed 's/^psql:[^ ]* //'
done

echo
if [ "$FAILED" -eq 0 ]; then
  echo "✅ نجحت جميع اختبارات قاعدة البيانات"
else
  echo "❌ فشل اختبار واحد أو أكثر"; exit 1
fi
