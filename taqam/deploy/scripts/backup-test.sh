#!/usr/bin/env bash
# تجربة النسخ الاحتياطي التلقائي كاملاً الآن: نسخة محلية + نسخة مشفّرة خارج الخادم (إن أُعدّت) + رابط النبض (إن أُعدّ).
#   bash deploy/scripts/backup-test.sh
# شغّل deploy.sh --no-pull أولاً بعد أي تعديل في deploy/.env حتى تقرأه حاوية النسخ.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=lib.sh
. scripts/lib.sh
require_env
db_running || { echo "✗ المنصة لا تعمل. شغّلها أولاً: bash deploy/scripts/deploy.sh --no-pull" >&2; exit 1; }
dc up -d --no-build backup >/dev/null 2>&1
if dc exec -T backup sh /backup-loop.sh --once < /dev/null; then
  echo "✓ النسخ الاحتياطي يعمل."
  [ -n "$(env_get OFFSITE_S3_BUCKET)" ] || echo "  • النسخ خارج الخادم غير مُعدّ (اختياري، يُنصح به — انظر FIRST-TIME.md الجزء 9)."
  [ -n "$(env_get BACKUP_HEARTBEAT_URL)" ] || echo "  • رابط النبض غير مُعدّ (اختياري، يُنصح به — انظر FIRST-TIME.md الجزء 8.3)."
else
  echo "✗ فشلت التجربة. اقرأ الرسالة أعلاه (غالباً قيمة خاطئة في OFFSITE_S3_* داخل deploy/.env)." >&2
  exit 1
fi
