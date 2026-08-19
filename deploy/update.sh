#!/usr/bin/env bash
# ============================================================
#  KINGSHOT — Update einspielen
#  Holt den neuesten Stand aus Git und kopiert die Spieldateien
#  in den Webroot (inkl. Versions-Stempel für Cache-Busting).
#  nginx bleibt unangetastet — Spielstände liegen im Browser.
#
#    sudo ./deploy/update.sh
#    sudo ./deploy/update.sh --root /pfad/zum/webroot
#    sudo ./deploy/update.sh --deploy-only     # ohne git pull (für Auto-Update)
# ============================================================
set -euo pipefail

# Webroot: --root > /etc/kingshot.conf (von install.sh gesetzt) > Standard
WEBROOT="/var/www/kingshot"
[[ -f /etc/kingshot.conf ]] && . /etc/kingshot.conf
DEPLOY_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) WEBROOT="$2"; shift 2 ;;
    --deploy-only) DEPLOY_ONLY=1; shift ;;
    -h|--help) grep '^#' "$0" | head -11; exit 0 ;;
    *) echo "Unbekannte Option: $1"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "❌ Bitte als root ausführen:  sudo $0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$SRC_DIR"

# safe.directory nur einmal eintragen (Repo kann einem anderen Nutzer gehören)
allow_repo() {
  command -v git >/dev/null 2>&1 || return 0
  git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$SRC_DIR" \
    || git config --global --add safe.directory "$SRC_DIR" 2>/dev/null || true
}

# Git-Update (nur wenn Repo vorhanden; Fehler sind nicht fatal)
if [[ $DEPLOY_ONLY -eq 0 && -d .git ]] && command -v git >/dev/null 2>&1; then
  echo "Hole neuesten Stand aus Git…"
  allow_repo
  git pull --ff-only || echo "⚠️  git pull übersprungen (lokale Änderungen oder kein Upstream)."
else
  allow_repo
fi

if [[ ! -d "$WEBROOT" ]]; then
  echo "❌ Webroot $WEBROOT existiert nicht. Erst installieren: sudo ./deploy/install.sh"
  exit 1
fi

if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    "$SRC_DIR/index.html" "$SRC_DIR/manifest.webmanifest" \
    "$SRC_DIR/css" "$SRC_DIR/js" "$SRC_DIR/assets" \
    "$WEBROOT/"
else
  rm -rf "${WEBROOT:?}/css" "${WEBROOT:?}/js" "${WEBROOT:?}/assets"
  cp -r "$SRC_DIR/index.html" "$SRC_DIR/manifest.webmanifest" \
        "$SRC_DIR/css" "$SRC_DIR/js" "$SRC_DIR/assets" "$WEBROOT/"
fi

# Cache-Busting + version.json (Spiel erkennt neue Version selbst)
"$SCRIPT_DIR/stamp-version.sh" "$WEBROOT"

chown -R root:root "$WEBROOT"
chmod -R a+rX,go-w "$WEBROOT"
command -v restorecon >/dev/null 2>&1 && restorecon -R "$WEBROOT" 2>/dev/null || true

echo "✅ KINGSHOT aktualisiert ($WEBROOT). Spieler bekommen die neue Version automatisch — Spielstände bleiben erhalten."
