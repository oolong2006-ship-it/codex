#!/usr/bin/env bash
# استرجاع نسخة احتياطية (يستبدل كل البيانات الحالية!):
#   bash deploy/scripts/restore.sh deploy/backups/shuoon-2026-11-01-0300.dump
set -euo pipefail
cd "$(dirname "$0")/.."
file="${1:?حدد ملف النسخة الاحتياطية}"
case "$file" in /*) ;; *) file="$OLDPWD/$file" ;; esac
[ -f "$file" ] || { echo "الملف غير موجود: $file"; exit 1; }
read -rp "سيستبدل هذا كل بيانات المنصة الحالية بمحتوى $file. اكتب «نعم» للمتابعة: " yes
[ "$yes" = "نعم" ] || { echo "أُلغي."; exit 1; }
bash scripts/backup-now.sh before-restore   # احتياط قبل الاسترجاع (لا يستبدل الملف المسترجَع)
docker compose -f docker-compose.prod.yml --env-file .env stop api
docker compose -f docker-compose.prod.yml --env-file .env exec -T db pg_restore -U shuoon -d shuoon --clean --if-exists --no-owner < "$file"
docker compose -f docker-compose.prod.yml --env-file .env start api
echo "✓ تم الاسترجاع."
