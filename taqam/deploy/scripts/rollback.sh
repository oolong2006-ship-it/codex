#!/usr/bin/env bash
# التراجع عن آخر تحديث (deploy.sh): يعيد تشغيل الصور السابقة (:prev) ويسترجع نسخة pre-deploy
# التي أُخذت تلقائياً قبل التحديث مباشرة.
#   bash deploy/scripts/rollback.sh                # صور سابقة + بيانات ما قبل التحديث
#   bash deploy/scripts/rollback.sh --images-only  # صور سابقة فقط، مع إبقاء البيانات الحالية
# تنبيه: استرجاع نسخة pre-deploy يحذف ما أُدخل في المنصة بعد التحديث (القاعدة الحالية تُحفظ وتُسترجع بـ restore.sh --undo).
# استخدم --images-only فقط إذا كان التحديث لا يغيّر قاعدة البيانات (اسأل المطوّر).
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=lib.sh
. scripts/lib.sh
require_env

images_only=0
for a in "$@"; do
  case "$a" in
    --images-only) images_only=1 ;;
    *) echo "خيار غير معروف: $a (المتاح: --images-only)"; exit 1 ;;
  esac
done

for img in shuoon-api shuoon-web; do
  docker image inspect "$img:prev" >/dev/null 2>&1 || { echo "✗ لا توجد نسخة سابقة ($img:prev) للتراجع إليها — يحدث هذا بعد أول تشغيل فقط."; exit 1; }
done

dump=""
if [ "$images_only" = 0 ]; then
  # shellcheck disable=SC2012
  dump=$(ls -1t backups/shuoon-*-pre-deploy.dump 2>/dev/null | head -n 1 || true)
  [ -n "$dump" ] || { echo "✗ لا توجد نسخة pre-deploy في deploy/backups. للتراجع بالصور فقط: bash deploy/scripts/rollback.sh --images-only"; exit 1; }
fi

echo "سيتم:"
echo "  • تشغيل نسخة المنصة السابقة (الصور المحفوظة قبل آخر تحديث)."
[ -z "$dump" ] || echo "  • استرجاع البيانات كما كانت قبل التحديث من: $dump"
[ -z "$dump" ] || echo "    (كل ما أُدخل بعد $(date -r "$dump" '+%F %H:%M') سيُفقد؛ القاعدة الحالية تُحفظ وتُعاد بـ restore.sh --undo)"
read -rp "اكتب «نعم» للمتابعة: " ans
[ "$ans" = "نعم" ] || { echo "أُلغي."; exit 1; }

echo "==> تبديل الصور إلى النسخة السابقة"
for img in shuoon-api shuoon-web shuoon-backup; do
  docker image inspect "$img:prev" >/dev/null 2>&1 || continue
  cur=$(docker image inspect -f '{{.Id}}' "$img:latest" 2>/dev/null || true)
  prev=$(docker image inspect -f '{{.Id}}' "$img:prev")
  [ "$cur" = "$prev" ] && continue
  [ -z "$cur" ] || docker tag "$img:latest" "$img:failed"
  docker tag "$img:prev" "$img:latest"
done

if [ -n "$dump" ]; then
  # restore.sh يوقف الخادم، يبدّل القاعدة، ثم يعيد تشغيله بالصورة السابقة (latest صارت = prev)
  bash scripts/restore.sh --yes "$dump"
fi
dc up -d --no-build --force-recreate api web backup
dc ps

echo "✓ تم التراجع إلى النسخة السابقة."
[ ! -f .deploy-prev-commit ] || echo "  نسخة الكود السابقة: $(cat .deploy-prev-commit)"
echo "  ⚠ لا تشغّل deploy.sh مجدداً حتى يُصلَح الخلل في GitHub، وإلا سيُبنى التحديث نفسه من جديد."
echo "  الصور المعطوبة محفوظة باسم :failed (للمطوّر)، وتُحذف لاحقاً بـ: docker image rm shuoon-api:failed shuoon-web:failed"
