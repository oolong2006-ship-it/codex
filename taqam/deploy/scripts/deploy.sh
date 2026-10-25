#!/usr/bin/env bash
# تشغيل أو تحديث المنصة: يسحب آخر نسخة من GitHub ويبني ويعيد التشغيل دون فقدان البيانات.
#   bash taqam/deploy/scripts/deploy.sh            # سحب ثم تشغيل
#   bash taqam/deploy/scripts/deploy.sh --no-pull  # تشغيل النسخة الموجودة كما هي
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "أنشئ deploy/.env أولاً: bash deploy/scripts/init-env.sh"; exit 1; }
if [ "${1:-}" != "--no-pull" ]; then git -C .. pull --ff-only; fi
mkdir -p backups
docker compose -f docker-compose.prod.yml --env-file .env up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose -f docker-compose.prod.yml --env-file .env ps
echo "✓ تم. للتحقق: bash deploy/scripts/check.sh"
