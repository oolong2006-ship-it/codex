#!/bin/sh
# يعمل داخل حاوية `backup` (صورة deploy/backup: postgres:16-alpine + rclone + gnupg + curl).
# نسخة pg_dump مضغوطة يومياً قرابة 03:00 بتوقيت الرياض في /backups، ويُحتفظ بآخر KEEP_DAYS يوماً.
# اختياري (من deploy/.env):
#   BACKUP_HEARTBEAT_URL  رابط نبض (healthchecks.io): يُطلب بعد النجاح، و/fail عند الفشل
#   OFFSITE_S3_*  + BACKUP_ENCRYPTION_PASSPHRASE  نسخة مشفّرة (GPG AES-256) في تخزين S3 (DigitalOcean Spaces…)
# بدون هذه المتغيرات: نسخ محلي فقط كما كان.
set -eu
umask 077

DIR=/backups
KEEP_DAYS=${KEEP_DAYS:-14}
case "$KEEP_DAYS" in ''|*[!0-9]*|0) KEEP_DAYS=14 ;; esac
OFFSITE_KEEP_DAYS=${OFFSITE_KEEP_DAYS:-30}
case "$OFFSITE_KEEP_DAYS" in ''|*[!0-9]*|0) OFFSITE_KEEP_DAYS=30 ;; esac
HB=${BACKUP_HEARTBEAT_URL:-}
BACKUP_HOUR=${BACKUP_HOUR:-0300}

log() { echo "$(date '+%F %T') [backup] $*"; }
err() { echo "$(date '+%F %T') [backup] ✗ $*" >&2; }

# ping "" (نجاح) أو ping "/fail" (فشل)
ping_hb() {
  [ -n "$HB" ] || return 0
  if ! curl -fsS -m 15 --retry 3 -o /dev/null --data-raw "${2:-}" "${HB%/}$1"; then
    err "تعذّر إرسال النبض إلى رابط BACKUP_HEARTBEAT_URL (تحقق من الرابط والاتصال)"
  fi
}

offsite_enabled() { [ -n "${OFFSITE_S3_BUCKET:-}" ]; }
OFFSITE_BROKEN=""

if offsite_enabled; then
  missing=""
  for v in OFFSITE_S3_ENDPOINT OFFSITE_S3_ACCESS_KEY OFFSITE_S3_SECRET_KEY BACKUP_ENCRYPTION_PASSPHRASE; do
    eval "x=\${$v:-}"
    # shellcheck disable=SC2154
    [ -n "$x" ] || missing="$missing $v"
  done
  if [ -n "$missing" ]; then
    err "النسخ الخارجي معطّل: ينقص في deploy/.env:$missing (النسخ المحلي يعمل)"
    OFFSITE_S3_BUCKET=""; OFFSITE_BROKEN="missing:$missing"
  elif [ "${#BACKUP_ENCRYPTION_PASSPHRASE}" -lt 20 ]; then
    err "النسخ الخارجي معطّل: BACKUP_ENCRYPTION_PASSPHRASE أقصر من 20 حرفاً (النسخ المحلي يعمل)"
    OFFSITE_S3_BUCKET=""; OFFSITE_BROKEN="passphrase too short"
  else
    # إعداد rclone من متغيرات البيئة فقط (لا يُكتب ملف إعداد)
    export RCLONE_CONFIG=""   # لا ملف إعداد
    export RCLONE_CONFIG_OFFSITE_TYPE=s3
    export RCLONE_CONFIG_OFFSITE_PROVIDER="${OFFSITE_S3_PROVIDER:-Other}"
    export RCLONE_CONFIG_OFFSITE_ENDPOINT="$OFFSITE_S3_ENDPOINT"
    export RCLONE_CONFIG_OFFSITE_REGION="${OFFSITE_S3_REGION:-us-east-1}"
    export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$OFFSITE_S3_ACCESS_KEY"
    export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$OFFSITE_S3_SECRET_KEY"
    export RCLONE_CONFIG_OFFSITE_ACL=private
    export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true
    log "النسخ الخارجي مفعّل: ${OFFSITE_S3_ENDPOINT}/${OFFSITE_S3_BUCKET}/${OFFSITE_S3_PREFIX:-} (مشفّر، يُحتفظ ${OFFSITE_KEEP_DAYS} يوماً)"
  fi
fi

# offsite_copy FILE — يشفّر ثم يرفع؛ يرجع غير صفر عند الفشل
offsite_copy() {
  src=$1; name=$(basename "$src").gpg
  enc=/tmp/$name
  export GNUPGHOME=/tmp/.gnupg; mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
  rm -f "$enc"
  if ! printf '%s' "$BACKUP_ENCRYPTION_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback \
        --passphrase-fd 0 --symmetric --cipher-algo AES256 --compress-algo none -o "$enc" "$src"; then
    err "فشل تشفير $src"; rm -f "$enc"; return 1
  fi
  dest="offsite:${OFFSITE_S3_BUCKET}/${OFFSITE_S3_PREFIX:-}"
  if ! rclone copyto --retries 3 --low-level-retries 5 "$enc" "${dest}${name}"; then
    err "فشل رفع $name إلى التخزين الخارجي (تحقق من OFFSITE_S3_* ومفاتيح الوصول)"; rm -f "$enc"; return 1
  fi
  rm -f "$enc"
  log "✓ رُفعت نسخة مشفّرة: ${dest}${name}"
  # حذف النسخ الخارجية القديمة (فشل الحذف لا يُفشل النسخة)
  rclone delete --min-age "${OFFSITE_KEEP_DAYS}d" --include 'shuoon-*.dump.gpg' "$dest" \
    || err "تعذّر حذف النسخ الخارجية القديمة (غير حرج)"
  return 0
}

# run_backup — نسخة واحدة الآن؛ يرجع 0 عند النجاح
run_backup() {
  # المساحة: تخطَّ إذا كانت المساحة الحرة أقل من ضعف حجم آخر نسخة
  # shellcheck disable=SC2012
  last=$(ls -1t "$DIR"/shuoon-*.dump 2>/dev/null | head -n 1 || true)
  if [ -n "$last" ]; then
    need_kb=$(( $(du -k "$last" | cut -f1) * 2 ))
    free_kb=$(df -Pk "$DIR" | awk 'NR==2 {print $4}')
    if [ "$free_kb" -lt "$need_kb" ]; then
      err "تخطّي النسخة: المساحة الحرة ${free_kb}KB أقل من ضعف حجم آخر نسخة (${need_kb}KB). حرّر مساحة على الخادم!"
      ping_hb /fail "low disk: free=${free_kb}KB need=${need_kb}KB"
      return 1
    fi
  fi

  f="$DIR/shuoon-$(date +%F-%H%M).dump"
  if ! pg_dump -Fc -f "$f.part"; then
    rm -f "$f.part"
    err "فشل pg_dump — لم تُؤخذ نسخة اليوم، ستُعاد المحاولة بعد 10 دقائق"
    ping_hb /fail "pg_dump failed"
    return 1
  fi
  mv "$f.part" "$f"
  log "✓ نسخة محلية: $f ($(du -h "$f" | cut -f1))"

  # الاحتفاظ: النسخ الأقدم من KEEP_DAYS يوماً (تُحذف فقط بعد نسخة ناجحة، فلا نفقد كل شيء إن تعطّل النسخ)
  find "$DIR" -maxdepth 1 -name 'shuoon-*.dump' -mtime +"$((KEEP_DAYS - 1))" -delete

  if offsite_enabled; then
    echo "$f" > "$DIR/.offsite-pending"
    offsite_retry
  elif [ -n "$OFFSITE_BROKEN" ]; then
    ping_hb /fail "local ok, offsite misconfigured ($OFFSITE_BROKEN)"
  else
    ping_hb "" "ok $(basename "$f")"
  fi
  return 0
}

# offsite_retry — يرفع آخر نسخة لم تُرفع بعد (يُعاد كل 10 دقائق حتى تنجح أو تأتي نسخة أحدث)
offsite_retry() {
  [ -f "$DIR/.offsite-pending" ] || return 0
  p=$(cat "$DIR/.offsite-pending")
  if [ ! -f "$p" ]; then rm -f "$DIR/.offsite-pending"; return 0; fi
  if offsite_copy "$p"; then
    rm -f "$DIR/.offsite-pending"
    ping_hb "" "ok $(basename "$p") + offsite"
  else
    ping_hb /fail "local ok, offsite upload failed: $(basename "$p")"
  fi
}

mkdir -p "$DIR"
chmod 700 "$DIR"
rm -f "$DIR"/*.part   # بقايا نسخة قُطعت (إعادة تشغيل أثناء النسخ)

# أوامر مساعدة للتخزين الخارجي (يستدعيها scripts/offsite.sh): --list و --get NAME
case "${1:-}" in
  --list|--get)
    offsite_enabled || { err "النسخ الخارجي غير مُعدّ في deploy/.env (OFFSITE_S3_* و BACKUP_ENCRYPTION_PASSPHRASE)"; exit 1; }
    dest="offsite:${OFFSITE_S3_BUCKET}/${OFFSITE_S3_PREFIX:-}"
    if [ "$1" = --list ]; then rclone lsl --include 'shuoon-*.dump.gpg' "$dest" | sort -k2,3; exit $?; fi
    name=$(basename "${2:?حدد اسم الملف}")
    case "$name" in *.dump.gpg) ;; *) err "الاسم يجب أن ينتهي بـ .dump.gpg"; exit 1 ;; esac
    out="$DIR/${name%.gpg}"
    export GNUPGHOME=/tmp/.gnupg; mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
    rclone copyto "${dest}${name}" "/tmp/$name" || { err "تعذّر تنزيل $name"; exit 1; }
    if printf '%s' "$BACKUP_ENCRYPTION_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback \
         --passphrase-fd 0 --decrypt -o "$out.part" "/tmp/$name"; then
      mv "$out.part" "$out"; rm -f "/tmp/$name"; log "✓ نُزّلت وفُكّ تشفيرها: deploy/backups/$(basename "$out")"; exit 0
    fi
    rm -f "$out.part" "/tmp/$name"; err "فشل فك التشفير (عبارة BACKUP_ENCRYPTION_PASSPHRASE مختلفة عن وقت النسخ؟)"; exit 1 ;;
esac

# --once: نسخة واحدة الآن ثم خروج (للاختبار: docker compose … run --rm backup --once)
if [ "${1:-}" = "--once" ]; then
  run_backup || exit 1
  [ ! -f "$DIR/.offsite-pending" ] || exit 1
  exit 0
fi

trap 'log "إيقاف"; exit 0' TERM INT
log "بدأ النسخ الاحتياطي اليومي (الساعة ${BACKUP_HOUR} بتوقيت ${TZ:-UTC}، احتفاظ ${KEEP_DAYS} يوماً في ${DIR})"
while true; do
  today=$(date +%F)
  if [ "$(cat "$DIR/.last" 2>/dev/null || true)" != "$today" ] && [ "$(date +%H%M)" -ge "$BACKUP_HOUR" ]; then
    if run_backup; then echo "$today" > "$DIR/.last"; fi
  elif offsite_enabled; then
    offsite_retry
  fi
  sleep 600 & wait $!   # (sleep في الخلفية حتى يستجيب الإيقاف docker stop فوراً)
done
