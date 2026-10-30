#!/usr/bin/env bash
# فحص سريع بعد التشغيل: حالة الحاويات، الخادم، الموقع، وشهادة HTTPS.
#   bash deploy/scripts/check.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
# shellcheck source=lib.sh
# shellcheck source=lib.sh source-path=SCRIPTDIR
. scripts/lib.sh
require_env
domain=$(env_get DOMAIN)
[ -n "$domain" ] || { echo "✗ DOMAIN فارغ في deploy/.env"; exit 1; }

dc ps
ok=0
check() { if curl -fsS -o /dev/null --max-time 15 "$1"; then echo "✓ $1"; else echo "✗ $1"; ok=1; fi; }
check "https://api.$domain/api/health"
check "https://www.$domain/"
check "https://www.$domain/login"
check "https://$domain/"
echo | openssl s_client -servername "www.$domain" -connect "www.$domain:443" 2>/dev/null | openssl x509 -noout -issuer -enddate 2>/dev/null \
  || { echo "✗ لم تُقرأ الشهادة بعد (قد يحتاج إصدارها دقيقة بعد ضبط DNS)"; ok=1; }

# آخر نسخة احتياطية
# shellcheck disable=SC2012
last=$(ls -1t backups/shuoon-*.dump 2>/dev/null | head -n 1 || true)
if [ -n "$last" ]; then echo "✓ آخر نسخة احتياطية: $last"; else echo "• لا توجد نسخ احتياطية بعد (أول نسخة تلقائية الساعة 3 فجراً)"; fi
# المساحة الحرة
used=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ "${used:-0}" -ge 80 ]; then echo "✗ القرص ممتلئ بنسبة ${used}% — حرّر مساحة"; ok=1; else echo "✓ القرص مستخدم ${used}%"; fi

if [ "$ok" != 0 ]; then
  echo
  echo "إذا استمرت ✗ أكثر من 10 دقائق بعد التشغيل، اعرض سجل الشهادات والخادم وأرسل الناتج:"
  echo "  docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env logs --tail 50 caddy"
  echo "  docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env logs --tail 50 api"
fi
exit $ok
