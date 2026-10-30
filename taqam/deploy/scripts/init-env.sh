#!/usr/bin/env bash
# ينشئ deploy/.env بأسرار عشوائية ويسألك عن الدومين وحساب مالك المنصة.
#   bash deploy/scripts/init-env.sh
# تُكتب كل القيم بين علامتي تنصيص مفردتين ('...') حتى لا يغيّر Docker الرموز $ و # والمسافات.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
if [ -f .env ]; then echo "deploy/.env موجود مسبقاً — عدّله يدوياً (nano deploy/.env) أو احذفه وأعد التشغيل."; exit 1; fi
command -v openssl >/dev/null || { echo "✗ openssl غير مثبّت. شغّل أولاً: bash deploy/scripts/setup-server.sh"; exit 1; }

tmp=.env.tmp
trap 'rm -f "$tmp"' EXIT   # إذا قُطع السكربت (Ctrl+C) لا يبقى ملف ناقص

# ---------- الأسئلة ----------
while true; do
  read -rp "الدومين بدون www [shuoon.net]: " domain
  domain=${domain:-shuoon.net}
  domain=$(printf '%s' "$domain" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
  domain=${domain#http://}; domain=${domain#https://}; domain=${domain#www.}
  domain=${domain%%/*}
  if [[ "$domain" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$ ]]; then break; fi
  echo "✗ «$domain» ليس دوميناً صحيحاً. اكتبه هكذا: shuoon.net (بدون https:// وبدون www)."
done
echo "  ← الدومين: $domain (الموقع: www.$domain — الخادم: api.$domain)"

email_ok() { [[ "$1" =~ ^[^@[:space:]\'\"]+@[^@[:space:]\'\"]+\.[^@[:space:]\'\".]+$ ]]; }
while true; do
  read -rp "بريد شهادات HTTPS [hello@$domain]: " acme; acme=${acme:-hello@$domain}
  email_ok "$acme" && break; echo "✗ بريد غير صحيح."
done
while true; do
  read -rp "بريد دخولك كمالك للمنصة: " admin_email
  email_ok "$admin_email" && break; echo "✗ بريد غير صحيح."
done

while true; do
  IFS= read -rsp "كلمة مرور مالك المنصة (12 حرفاً على الأقل): " admin_pass; echo
  if [ ${#admin_pass} -lt 12 ]; then echo "✗ قصيرة جداً (${#admin_pass} حرفاً). أعد المحاولة."; continue; fi
  case "$admin_pass" in *"'"*) echo "✗ لا تستخدم علامة التنصيص المفردة ' في كلمة المرور. أعد المحاولة."; continue ;; esac
  IFS= read -rsp "أعد كتابة كلمة المرور للتأكيد: " admin_pass2; echo
  [ "$admin_pass" = "$admin_pass2" ] && break
  echo "✗ الكلمتان غير متطابقتين. أعد المحاولة."
done

# ---------- كتابة الملف ----------
declare -A val=(
  [DOMAIN]="$domain"
  [ACME_EMAIL]="$acme"
  [POSTGRES_PASSWORD]="$(openssl rand -hex 24)"
  [JWT_SECRET]="$(openssl rand -hex 32)"
  [PLATFORM_ADMIN_EMAIL]="$admin_email"
  [PLATFORM_ADMIN_PASSWORD]="$admin_pass"
)
for k in "${!val[@]}"; do
  case "${val[$k]}" in *"'"*|*$'\n'*|*$'\r'*) echo "✗ قيمة غير مسموحة في $k"; exit 1 ;; esac
done

: > "$tmp"
while IFS= read -r line || [ -n "$line" ]; do
  key=${line%%=*}
  if [[ "$line" == *=* && "$key" =~ ^[A-Z_][A-Z0-9_]*$ && -n "${val[$key]+x}" ]]; then
    printf "%s='%s'\n" "$key" "${val[$key]}" >> "$tmp"
  else
    printf '%s\n' "$line" >> "$tmp"
  fi
done < .env.example
chmod 600 "$tmp"
mv "$tmp" .env
trap - EXIT
mkdir -p backups && chmod 700 backups

echo "✓ تم إنشاء deploy/.env (صلاحيات مقفلة 600)."
echo "  لإعداد البريد الصادر أو النسخ خارج الخادم عدّل الملف: nano deploy/.env"
echo "  الخطوة التالية: bash deploy/scripts/deploy.sh --no-pull"
