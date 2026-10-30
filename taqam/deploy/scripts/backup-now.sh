#!/usr/bin/env bash
# نسخة احتياطية فورية في deploy/backups (اختياري: لاحقة للاسم، مثل before-restore أو pre-deploy)
#   bash deploy/scripts/backup-now.sh
set -euo pipefail
umask 077   # النسخ تحتوي رواتب وآيبانات كل الشركات: للمالك root فقط
cd "$(dirname "$0")/.."
# shellcheck source=lib.sh
# shellcheck source=lib.sh source-path=SCRIPTDIR
. scripts/lib.sh
require_env
db_running || { echo "✗ قاعدة البيانات لا تعمل الآن. شغّل المنصة أولاً: bash deploy/scripts/deploy.sh --no-pull" >&2; exit 1; }
mkdir -p backups && chmod 700 backups
f="backups/shuoon-$(date +%F-%H%M%S)-${1:-manual}.dump"
trap 'rm -f "$f.part"' EXIT
dc exec -T db pg_dump -U shuoon -d shuoon -Fc < /dev/null > "$f.part"
[ -s "$f.part" ] || { echo "✗ النسخة فارغة — لم تُحفظ." >&2; exit 1; }
mv "$f.part" "$f"
trap - EXIT
echo "✓ $f ($(du -h "$f" | cut -f1))"
