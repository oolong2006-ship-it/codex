#!/usr/bin/env bash
# ينشئ deploy/.env بأسرار عشوائية ويسألك عن الدومين وحساب مالك المنصة.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo "deploy/.env موجود مسبقاً — عدّله يدوياً أو احذفه وأعد التشغيل."; exit 1; fi
cp .env.example .env

read -rp "الدومين بدون www [shuoon.net]: " domain; domain=${domain:-shuoon.net}
read -rp "بريد شهادات HTTPS [hello@$domain]: " acme; acme=${acme:-hello@$domain}
read -rp "بريد دخولك كمالك للمنصة: " admin_email
while true; do
  read -rsp "كلمة مرور مالك المنصة (12 حرفاً على الأقل): " admin_pass; echo
  [ ${#admin_pass} -ge 12 ] && break; echo "قصيرة جداً."
done

set_var() { # key value — replaces KEY=... safely (values may contain / & etc.)
  python3 - "$1" "$2" <<'PY'
import sys, re
k, v = sys.argv[1], sys.argv[2]
p = '.env'; s = open(p, encoding='utf-8').read()
s = re.sub(rf'^{k}=.*$', lambda m: f'{k}={v}', s, count=1, flags=re.M)
open(p, 'w', encoding='utf-8').write(s)
PY
}
set_var DOMAIN "$domain"
set_var ACME_EMAIL "$acme"
set_var POSTGRES_PASSWORD "$(openssl rand -hex 24)"
set_var JWT_SECRET "$(openssl rand -hex 32)"
set_var PLATFORM_ADMIN_EMAIL "$admin_email"
set_var PLATFORM_ADMIN_PASSWORD "$admin_pass"
chmod 600 .env
echo "✓ تم إنشاء deploy/.env. لإعداد البريد الصادر عدّل SMTP_* فيه. الخطوة التالية: bash deploy/scripts/deploy.sh"
