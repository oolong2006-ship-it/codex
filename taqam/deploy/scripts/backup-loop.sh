#!/bin/sh
# Runs inside the `backup` container: one compressed pg_dump per day at ~03:00 Riyadh, keeps KEEP_DAYS days.
set -eu
mkdir -p /backups
while true; do
  now=$(date +%H%M)
  if [ ! -f /backups/.last ] || [ "$(cat /backups/.last)" != "$(date +%F)" ] && [ "$now" -ge 0300 ]; then
    f="/backups/shuoon-$(date +%F-%H%M).dump"
    if pg_dump -Fc -f "$f.part"; then
      mv "$f.part" "$f"
      date +%F > /backups/.last
      echo "backup ok: $f ($(du -h "$f" | cut -f1))"
    else
      rm -f "$f.part"
      echo "backup FAILED at $(date)" >&2
    fi
    find /backups -name 'shuoon-*.dump' -mtime +"${KEEP_DAYS:-14}" -delete
  fi
  sleep 600
done
