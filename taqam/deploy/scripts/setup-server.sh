#!/usr/bin/env bash
# تجهيز خادم Ubuntu 22.04/24.04 جديد لتشغيل شؤون. شغّله مرة واحدة كـ root من مجلد shuoon/taqam:
#   bash deploy/scripts/setup-server.sh
# آمن لإعادة التشغيل. لإبقاء الدخول بكلمة مرور SSH حتى مع وجود مفتاح: KEEP_SSH_PASSWORD=1 bash deploy/scripts/setup-server.sh
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "شغّل السكربت كـ root (أو: sudo bash deploy/scripts/setup-server.sh)"; exit 1; }
# no interactive prompts (needrestart / config questions) during upgrades
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
APT=(apt-get -y -o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

if command -v cloud-init >/dev/null; then
  echo "==> انتظار انتهاء تجهيز الخادم الأولي (cloud-init) — قد يأخذ دقيقة أو دقيقتين"
  cloud-init status --wait >/dev/null 2>&1 || true
fi

echo "==> تحديث النظام"
"${APT[@]}" update
"${APT[@]}" upgrade
"${APT[@]}" install ca-certificates curl git ufw openssl fail2ban python3-systemd

if ! command -v docker >/dev/null; then
  echo "==> تثبيت Docker"
  for i in 1 2 3; do
    if curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sh /tmp/get-docker.sh; then break; fi
    [ "$i" = 3 ] && { echo "✗ تعذّر تثبيت Docker بعد 3 محاولات. تحقق من الإنترنت وأعد تشغيل السكربت."; exit 1; }
    echo "⚠ فشلت المحاولة $i، إعادة بعد 20 ثانية…"; sleep 20
  done
  rm -f /tmp/get-docker.sh
fi

echo "==> إعداد Docker: تدوير السجلات (20MB × 5 لكل حاوية)"
mkdir -p /etc/docker
python3 - <<'PY'
import json, os
p = '/etc/docker/daemon.json'
cfg = {}
if os.path.exists(p):
    try:
        cfg = json.load(open(p))
    except Exception:
        os.rename(p, p + '.bak')
cfg['log-driver'] = 'local'
cfg['log-opts'] = {'max-size': '20m', 'max-file': '5'}
json.dump(cfg, open(p, 'w'), indent=2)
PY
systemctl enable docker >/dev/null 2>&1 || true
systemctl restart docker
docker compose version >/dev/null || { echo "✗ Docker Compose غير متوفر"; exit 1; }

echo "==> الجدار الناري: SSH و HTTP و HTTPS فقط"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> fail2ban: حظر تلقائي لمحاولات تخمين كلمة مرور SSH"
cat > /etc/fail2ban/jail.d/shuoon.local <<'EOF'
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
systemctl enable fail2ban >/dev/null 2>&1 || true
systemctl restart fail2ban || echo "⚠ لم يبدأ fail2ban (غير حرج). راجع: systemctl status fail2ban"

echo "==> SSH"
if [ "${KEEP_SSH_PASSWORD:-0}" != 1 ] && [ -s /root/.ssh/authorized_keys ] \
   && grep -qE '^[[:space:]]*(ssh-(ed25519|rsa)|ecdsa-sha2-|sk-)' /root/.ssh/authorized_keys; then
  cat > /etc/ssh/sshd_config.d/00-shuoon-hardening.conf <<'EOF'
# أضافه setup-server.sh: الدخول بمفتاح SSH فقط
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  if sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
    echo "✓ وُجد مفتاح SSH، فعُطِّل الدخول بكلمة المرور (الدخول الآن بالمفتاح فقط)."
    echo "  للتراجع: rm /etc/ssh/sshd_config.d/00-shuoon-hardening.conf && systemctl reload ssh"
  else
    rm -f /etc/ssh/sshd_config.d/00-shuoon-hardening.conf
    echo "⚠ لم يُغيَّر إعداد SSH (فشل التحقق من الإعداد)."
  fi
else
  echo "• لم يُعثر على مفتاح SSH في /root/.ssh/authorized_keys (أو KEEP_SSH_PASSWORD=1)، فبقي الدخول بكلمة المرور."
  echo "  يُنصح بالدخول بمفتاح SSH (انظر FIRST-TIME.md). fail2ban يحظر محاولات التخمين في الأثناء."
fi

# بناء الواجهة يحتاج ذاكرة: أضف 4GB swap إذا لم توجد
if ! swapon --show | grep -q .; then
  echo "==> إنشاء ملف swap بحجم 4GB"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

timedatectl set-timezone Asia/Riyadh || true

echo
echo "✓ الخادم جاهز."
if [ -f /var/run/reboot-required ]; then
  echo "⚠ التحديثات تحتاج إعادة تشغيل الخادم. نفّذ الآن:  reboot"
  echo "  انتظر دقيقة، ثم ادخل مجدداً بـ ssh، ثم:  cd shuoon/taqam"
fi
echo "الخطوة التالية: bash deploy/scripts/init-env.sh"
