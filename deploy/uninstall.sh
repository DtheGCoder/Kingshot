#!/usr/bin/env bash
# ============================================================
#  KINGSHOT — Deinstallation
#  Entfernt NUR die Kingshot-nginx-Site. Andere Sites bleiben
#  unberührt. Spielstände liegen im Browser (localStorage) und
#  bleiben erhalten.
#
#    sudo ./deploy/uninstall.sh            # Site entfernen
#    sudo ./deploy/uninstall.sh --purge    # + Webroot löschen
# ============================================================
set -euo pipefail

WEBROOT="/var/www/kingshot"
[[ -f /etc/kingshot.conf ]] && . /etc/kingshot.conf
SITE_NAME="kingshot"
PURGE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge) PURGE=1; shift ;;
    --root)  WEBROOT="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | head -10; exit 0 ;;
    *) echo "Unbekannte Option: $1"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "❌ Bitte als root ausführen:  sudo $0"
  exit 1
fi

# Auto-Update-Timer/Cron zuerst entfernen
if [[ -f /etc/systemd/system/kingshot-update.timer || -f /etc/cron.d/kingshot-update ]]; then
  systemctl disable --now kingshot-update.timer 2>/dev/null || true
  rm -f /etc/systemd/system/kingshot-update.timer /etc/systemd/system/kingshot-update.service /etc/cron.d/kingshot-update
  command -v systemctl >/dev/null 2>&1 && systemctl daemon-reload 2>/dev/null || true
  echo "🗑️  Auto-Update entfernt."
fi

REMOVED=0
for f in "/etc/nginx/sites-enabled/${SITE_NAME}.conf" \
         "/etc/nginx/sites-available/${SITE_NAME}.conf" \
         "/etc/nginx/conf.d/${SITE_NAME}.conf"; do
  if [[ -e "$f" || -L "$f" ]]; then
    rm -f "$f"
    echo "🗑️  entfernt: $f"
    REMOVED=1
  fi
done

if [[ $REMOVED -eq 1 ]] && command -v nginx >/dev/null 2>&1; then
  nginx -t && (systemctl reload nginx 2>/dev/null || nginx -s reload)
  echo "✅ nginx neu geladen — andere Sites laufen weiter."
fi

if [[ $PURGE -eq 1 && -d "$WEBROOT" ]]; then
  rm -rf "$WEBROOT"
  echo "🗑️  Webroot gelöscht: $WEBROOT"
fi
rm -f /etc/kingshot.conf

echo "👋 KINGSHOT wurde vom Server entfernt."
