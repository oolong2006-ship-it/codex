#!/usr/bin/env bash
# فحص سريع بعد التشغيل: حالة الحاويات، الخادم، الموقع، وشهادة HTTPS.
set -uo pipefail
cd "$(dirname "$0")/.."
domain=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)
docker compose -f docker-compose.prod.yml --env-file .env ps
ok=0
check() { if curl -fsS -o /dev/null --max-time 15 "$1"; then echo "✓ $1"; else echo "✗ $1"; ok=1; fi; }
check "https://api.$domain/api/health"
check "https://www.$domain/"
check "https://www.$domain/login"
echo | openssl s_client -servername "www.$domain" -connect "www.$domain:443" 2>/dev/null | openssl x509 -noout -issuer -enddate 2>/dev/null || echo "✗ لم تُقرأ الشهادة بعد (قد يحتاج إصدارها دقيقة بعد ضبط DNS)"
exit $ok
