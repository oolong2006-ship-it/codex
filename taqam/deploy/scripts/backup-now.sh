#!/usr/bin/env bash
# نسخة احتياطية فورية في deploy/backups (اختياري: لاحقة للاسم، مثل before-restore)
set -euo pipefail
cd "$(dirname "$0")/.."
f="backups/shuoon-$(date +%F-%H%M%S)-${1:-manual}.dump"
mkdir -p backups
docker compose -f docker-compose.prod.yml --env-file .env exec -T db pg_dump -U shuoon -d shuoon -Fc > "$f"
echo "✓ $f ($(du -h "$f" | cut -f1))"
