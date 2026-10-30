#!/usr/bin/env bash
# استرجاع نسخة احتياطية (يستبدل كل البيانات الحالية بمحتوى النسخة):
#   bash deploy/scripts/restore.sh deploy/backups/shuoon-2026-11-01-0300.dump
# التراجع عن آخر استرجاع (إرجاع قاعدة البيانات كما كانت قبله):
#   bash deploy/scripts/restore.sh --undo
#
# كيف يعمل (آمن): تُسترجَع النسخة أولاً في قاعدة جديدة مؤقتة (shuoon_restore) في معاملة واحدة
# (--single-transaction --exit-on-error) والمنصة ما زالت تعمل. إذا فشل أي شيء تُحذف المؤقتة ولا يتغيّر شيء.
# إذا نجح: يُوقَف الخادم (api) لثوانٍ، وتُبدَّل الأسماء: القديمة ← shuoon_old_<التاريخ> والجديدة ← shuoon،
# ثم يعود الخادم ويطبّق تلقائياً أي تحديثات لقاعدة البيانات (prisma migrate) إن كانت النسخة من إصدار أقدم.
# تُحفَظ القاعدة القديمة حتى الاسترجاع التالي (للتراجع بـ --undo).
#   --yes  بدون سؤال تأكيد (يستخدمه rollback.sh)
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
# shellcheck source=lib.sh
# shellcheck source=lib.sh source-path=SCRIPTDIR
. scripts/lib.sh
require_env
db_running || { echo "✗ قاعدة البيانات لا تعمل. شغّلها أولاً: docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d db" >&2; exit 1; }

yes=0; undo=0; file=""
for a in "$@"; do
  case "$a" in
    --yes) yes=1 ;;
    --undo) undo=1 ;;
    *) file=$a ;;
  esac
done

psql_admin() { dc exec -T -e PGOPTIONS="-c client_min_messages=warning" db psql -U shuoon -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
db_list() { psql_admin -c "SELECT datname FROM pg_database WHERE datname LIKE '$1' ORDER BY datname DESC" </dev/null; }

api_stopped=0
start_api() {
  [ "$api_stopped" = 1 ] || return 0
  echo "==> إعادة تشغيل الخادم (api)"
  # --force-recreate: يضمن تشغيل الصورة الموسومة latest الآن (مهم عند التراجع rollback.sh)
  { dc up -d --no-build --no-deps --force-recreate api && dc up -d --no-build web; } >/dev/null || echo "✗ تعذّر تشغيل الخادم. شغّله يدوياً: bash deploy/scripts/deploy.sh --no-pull" >&2
  api_stopped=0
}
trap start_api EXIT   # مهما حدث، يعود الخادم للعمل

stop_api() { dc stop api >/dev/null; api_stopped=1; }

# swap_db FROM TO — يجعل قاعدة FROM هي shuoon، والحالية تصبح TO
swap_db() {
  psql_admin <<SQL
ALTER DATABASE shuoon ALLOW_CONNECTIONS false;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'shuoon' AND pid <> pg_backend_pid();
BEGIN;
ALTER DATABASE shuoon RENAME TO "$2";
ALTER DATABASE "$1" RENAME TO shuoon;
COMMIT;
ALTER DATABASE shuoon ALLOW_CONNECTIONS true;
SQL
}

wait_api() {
  echo -n "==> انتظار جاهزية الخادم"
  local id st
  for _ in $(seq 1 40); do
    id=$(dc ps -q api 2>/dev/null || true)
    st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id" 2>/dev/null || true)
    if [ "$st" = healthy ]; then echo " ✓"; return 0; fi
    echo -n "."; sleep 3
  done
  echo; echo "✗ الخادم لم يصبح جاهزاً بعد دقيقتين. راجع: docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env logs --tail 100 api" >&2
  return 1
}

if [ "$undo" = 1 ]; then
  old=$(db_list 'shuoon\_old\_%' | head -n 1)
  [ -n "$old" ] || { echo "✗ لا توجد قاعدة سابقة للتراجع إليها."; exit 1; }
  if [ "$yes" != 1 ]; then
    read -rp "سيُعيد هذا قاعدة البيانات كما كانت قبل آخر استرجاع ($old). اكتب «نعم» للمتابعة: " ans
    [ "$ans" = "نعم" ] || { echo "أُلغي."; exit 1; }
  fi
  psql_admin -c "ALTER DATABASE \"$old\" ALLOW_CONNECTIONS true" </dev/null >/dev/null
  stop_api
  swap_db "$old" "shuoon_undone_$(date +%Y%m%d%H%M%S)"
  start_api; wait_api || true
  echo "✓ تم التراجع. القاعدة التي كانت مسترجَعة حُفظت باسم shuoon_undone_… وستُحذف عند الاسترجاع التالي."
  exit 0
fi

[ -n "$file" ] || { echo "حدد ملف النسخة الاحتياطية، مثال: bash deploy/scripts/restore.sh deploy/backups/shuoon-2026-11-01-0300.dump"; exit 1; }
case "$file" in /*) ;; *) file="$OLDPWD/$file" ;; esac
[ -f "$file" ] || { echo "✗ الملف غير موجود: $file"; exit 1; }
case "$file" in *.gpg) echo "✗ هذا ملف مشفّر من التخزين الخارجي. فكّه أولاً: bash deploy/scripts/offsite.sh get $(basename "$file")"; exit 1 ;; esac

echo "==> فحص الملف"
if ! dc exec -T db pg_restore -l < "$file" >/dev/null 2>&1; then
  echo "✗ الملف ليس نسخة احتياطية صالحة (pg_dump بصيغة -Fc) أو أنه تالف: $file"; exit 1
fi

if [ "$yes" != 1 ]; then
  read -rp "سيستبدل هذا كل بيانات المنصة الحالية بمحتوى $(basename "$file"). اكتب «نعم» للمتابعة: " ans
  [ "$ans" = "نعم" ] || { echo "أُلغي."; exit 1; }
fi

bash scripts/backup-now.sh before-restore   # احتياط إضافي قبل الاسترجاع

echo "==> استرجاع النسخة في قاعدة مؤقتة (المنصة ما زالت تعمل)"
psql_admin -c "DROP DATABASE IF EXISTS shuoon_restore WITH (FORCE)" </dev/null >/dev/null
psql_admin -c "CREATE DATABASE shuoon_restore OWNER shuoon" </dev/null >/dev/null
if ! dc exec -T db pg_restore -U shuoon -d shuoon_restore --no-owner --single-transaction --exit-on-error < "$file"; then
  psql_admin -c "DROP DATABASE IF EXISTS shuoon_restore WITH (FORCE)" </dev/null >/dev/null || true
  echo "✗ فشل الاسترجاع ولم يتغيّر شيء في بيانات المنصة." >&2
  exit 1
fi

# نجح الاسترجاع: احذف قواعد الاسترجاع الأقدم (يبقى جيل واحد فقط للتراجع، توفيراً للمساحة)
for d in $(db_list 'shuoon\_old\_%') $(db_list 'shuoon\_undone\_%'); do
  psql_admin -c "DROP DATABASE IF EXISTS \"$d\" WITH (FORCE)" </dev/null >/dev/null
done

echo "==> تبديل قاعدة البيانات (توقف قصير للخادم)"
old="shuoon_old_$(date +%Y%m%d%H%M%S)"
stop_api
swap_db shuoon_restore "$old"
start_api
wait_api || true
echo "✓ تم الاسترجاع. القاعدة السابقة محفوظة باسم $old (للتراجع: bash deploy/scripts/restore.sh --undo)."
echo "  تُحذف تلقائياً عند الاسترجاع التالي."
