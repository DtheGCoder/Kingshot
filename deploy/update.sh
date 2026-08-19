#!/usr/bin/env bash
# ============================================================
#  KINGSHOT — Update einspielen
#  Holt den neuesten Stand aus Git (falls möglich) und kopiert
#  die Spieldateien in den Webroot. nginx bleibt unangetastet.
#
#    sudo ./deploy/update.sh
#    sudo ./deploy/update.sh --root /pfad/zum/webroot
# ============================================================
set -euo pipefail

WEBROOT="/var/www/kingshot"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) WEBROOT="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | head -9; exit 0 ;;
    *) echo "Unbekannte Option: $1"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "❌ Bitte als root ausführen:  sudo $0"
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SRC_DIR"

# Git-Update (nur wenn Repo & sauber; Fehler sind nicht fatal)
if [[ -d .git ]] && command -v git >/dev/null 2>&1; then
  echo "🔄 Hole neuesten Stand aus Git…"
  # Repo kann root gehören oder einem Nutzer — safe.directory temporär erlauben
  git config --global --add safe.directory "$SRC_DIR" 2>/dev/null || true
  git pull --ff-only || echo "⚠️  git pull übersprungen (lokale Änderungen oder kein Upstream)."
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
chown -R root:root "$WEBROOT"
chmod -R a+rX,go-w "$WEBROOT"
command -v restorecon >/dev/null 2>&1 && restorecon -R "$WEBROOT" 2>/dev/null || true

echo "✅ KINGSHOT aktualisiert ($WEBROOT). Einfach Seite neu laden — Spielstände bleiben erhalten."
