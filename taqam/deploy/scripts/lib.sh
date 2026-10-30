# shellcheck shell=bash
# دوال مشتركة لسكربتات النشر. لا تُشغَّل مباشرة: تُحمَّل بـ `. scripts/lib.sh` من مجلد deploy/.

# docker compose بملفات الإنتاج
dc() { docker compose -f docker-compose.prod.yml --env-file .env "$@"; }

# env_get KEY — يقرأ قيمة من deploy/.env دون تنفيذه، ويزيل علامات التنصيص و\r (ملفات حُرِّرت في ويندوز)
env_get() {
  local line v
  line=$(grep -E "^[[:space:]]*$1=" .env 2>/dev/null | tail -n 1) || true
  v=${line#*=}
  v=${v%$'\r'}
  case "$v" in
    \'*\') v=${v#\'}; v=${v%\'} ;;
    \"*\") v=${v#\"}; v=${v%\"} ;;
    *) v=${v%%[[:space:]]#*}; v=${v%"${v##*[![:space:]]}"} ;;  # قيمة بلا تنصيص: احذف التعليق والمسافات اللاحقة
  esac
  printf '%s' "$v"
}

require_env() {
  [ -f .env ] || { echo "✗ لا يوجد deploy/.env بعد. أنشئه أولاً: bash deploy/scripts/init-env.sh" >&2; exit 1; }
}

# هل حاوية قاعدة البيانات تعمل الآن؟
db_running() { dc ps --status running --services 2>/dev/null | grep -qx db; }
