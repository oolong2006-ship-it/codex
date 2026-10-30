#!/usr/bin/env bash
# تشغيل أو تحديث المنصة: يسحب آخر نسخة من GitHub ويبني ويعيد التشغيل دون فقدان البيانات.
#   bash deploy/scripts/deploy.sh            # سحب ثم تشغيل
#   bash deploy/scripts/deploy.sh --no-pull  # تشغيل النسخة الموجودة كما هي (أول مرة، أو بعد تعديل .env)
# قبل كل تحديث: نسخة احتياطية pre-deploy، وحفظ الصور الحالية باسم :prev — للتراجع: bash deploy/scripts/rollback.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=lib.sh
# shellcheck source=lib.sh source-path=SCRIPTDIR
. scripts/lib.sh
require_env

pull=1
for a in "$@"; do
  case "$a" in
    --no-pull) pull=0 ;;
    *) echo "خيار غير معروف: $a (المتاح: --no-pull)"; exit 1 ;;
  esac
done

git_fail() {
  local branch=$1
  cat >&2 <<EOF

✗ تعذّر تحديث الكود من GitHub (الفرع: $branch). لم يتغيّر شيء في المنصة، وهي ما زالت تعمل.
الأسباب الشائعة وحلولها (من مجلد shuoon/taqam):
  1) عدّلت ملفات الكود على الخادم بالخطأ. اعرضها بـ:  git status
     لإلغاء تعديلاتك على الكود فقط:  git checkout -- .
  2) الفرع أُعيدت كتابته على GitHub (يحدث مع فروع التطوير). لمطابقة GitHub تماماً:
       git fetch origin && git reset --hard origin/$branch
     (لا يمس هذا ملف deploy/.env ولا مجلد deploy/backups.)
  3) اسم الفرع في DEPLOY_BRANCH داخل deploy/.env غير موجود على GitHub: صحّحه أو اتركه فارغاً.
  4) لا اتصال بالإنترنت أو المستودع خاص وانتهت صلاحية رمز الوصول: جرّب  git fetch  واقرأ الرسالة.
ثم أعد: bash deploy/scripts/deploy.sh
EOF
  exit 1
}

if [ "$pull" = 1 ]; then
  current=$(git -C .. rev-parse --abbrev-ref HEAD)
  branch=$(env_get DEPLOY_BRANCH); branch=${branch:-$current}
  if [ "$branch" = HEAD ]; then
    echo "✗ الكود على الخادم ليس على فرع (detached). حدّد الفرع في deploy/.env: DEPLOY_BRANCH='اسم_الفرع'" >&2; exit 1
  fi
  echo "==> سحب آخر نسخة من الفرع $branch"
  git -C .. fetch origin "$branch" || git_fail "$branch"
  if [ "$branch" != "$current" ]; then
    echo "==> الانتقال من الفرع $current إلى $branch"
    git -C .. checkout "$branch" 2>/dev/null || git -C .. checkout -b "$branch" --track "origin/$branch" || git_fail "$branch"
  fi
  git -C .. merge --ff-only "origin/$branch" || git_fail "$branch"
fi
echo "==> الكود: $(git -C .. log -1 --format='%h %s (%cd)' --date=short 2>/dev/null || echo '?')"

mkdir -p backups && chmod 700 backups

# 1) نسخة احتياطية قبل التحديث (إذا كانت المنصة تعمل)
if db_running; then
  echo "==> نسخة احتياطية قبل التحديث"
  bash scripts/backup-now.sh pre-deploy || { echo "✗ فشلت النسخة الاحتياطية، أُوقف التحديث احتياطاً." >&2; exit 1; }
fi

# 2) احفظ الصور الحالية باسم :prev (للتراجع)
for img in shuoon-api shuoon-web shuoon-backup; do
  if docker image inspect "$img:latest" >/dev/null 2>&1; then docker tag "$img:latest" "$img:prev"; fi
done
[ ! -f .deploy-commit ] || cp .deploy-commit .deploy-prev-commit

# 3) حدّث الصور الجاهزة (postgres و caddy) وابنِ الجديدة على أحدث صور الأساس
echo "==> تحديث الصور الجاهزة"
dc pull --ignore-buildable --quiet || echo "⚠ تعذّر تحديث بعض الصور الجاهزة؛ سنكمل بالموجودة."
echo "==> البناء (أول مرة 5–15 دقيقة)"
dc build --pull || { echo "✗ فشل البناء. المنصة القديمة ما زالت تعمل كما هي. أرسل آخر 30 سطراً من الرسالة أعلاه." >&2; exit 1; }

# 4) التشغيل
dc up -d --remove-orphans
git -C .. rev-parse HEAD > .deploy-commit 2>/dev/null || true

# 5) تنظيف: الصور غير المستخدمة (تبقى :prev) وذاكرة البناء الأقدم من أسبوع
docker image prune -f >/dev/null || true
docker builder prune -f --filter until=168h >/dev/null || true

dc ps
echo "✓ تم. للتحقق: bash deploy/scripts/check.sh"
echo "  إذا ظهرت مشكلة بعد التحديث: bash deploy/scripts/rollback.sh"
