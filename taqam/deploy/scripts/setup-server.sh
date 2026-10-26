#!/usr/bin/env bash
# تجهيز خادم Ubuntu 22.04/24.04 جديد لتشغيل شؤون. شغّله مرة واحدة كـ root:
#   sudo bash taqam/deploy/scripts/setup-server.sh
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "شغّل السكربت بـ sudo"; exit 1; }
# no interactive prompts (needrestart / config questions) during upgrades
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

echo "==> تحديث النظام"
apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw openssl

if ! command -v docker >/dev/null; then
  echo "==> تثبيت Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> الجدار الناري: SSH و HTTP و HTTPS فقط"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# بناء الواجهة يحتاج ذاكرة: أضف 4GB swap إذا لم توجد
if ! swapon --show | grep -q .; then
  echo "==> إنشاء ملف swap بحجم 4GB"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

timedatectl set-timezone Asia/Riyadh || true
echo "✓ الخادم جاهز. الخطوة التالية: bash taqam/deploy/scripts/init-env.sh"
