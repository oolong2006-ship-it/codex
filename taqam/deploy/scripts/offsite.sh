#!/usr/bin/env bash
# النسخ المشفّرة خارج الخادم (يتطلب ضبط OFFSITE_S3_* و BACKUP_ENCRYPTION_PASSPHRASE في deploy/.env):
#   bash deploy/scripts/offsite.sh list        # عرض النسخ الموجودة في التخزين الخارجي
#   bash deploy/scripts/offsite.sh get <اسم>   # تنزيل نسخة وفك تشفيرها إلى deploy/backups/ ثم استرجعها بـ restore.sh
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
# shellcheck source=lib.sh
# shellcheck source=lib.sh source-path=SCRIPTDIR
. scripts/lib.sh
require_env
[ -n "$(env_get OFFSITE_S3_BUCKET)" ] || { echo "✗ النسخ الخارجي غير مُعدّ: عبّئ OFFSITE_S3_* و BACKUP_ENCRYPTION_PASSPHRASE في deploy/.env (انظر README)"; exit 1; }
mkdir -p backups && chmod 700 backups
dc up -d --no-build backup >/dev/null 2>&1  # تأكد أن حاوية النسخ تعمل بآخر إعدادات .env
case "${1:-}" in
  list) dc exec -T backup sh /backup-loop.sh --list < /dev/null ;;
  get)  dc exec -T backup sh /backup-loop.sh --get < /dev/null "${2:?حدد اسم الملف من: bash deploy/scripts/offsite.sh list}"
        echo "للاسترجاع: bash deploy/scripts/restore.sh deploy/backups/$(basename "${2%.gpg}")" ;;
  *) sed -n '2,4p' "$0"; exit 1 ;;
esac
