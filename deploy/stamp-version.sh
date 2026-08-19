#!/usr/bin/env bash
# ============================================================
#  KINGSHOT — Versions-Stempel
#  Versieht die Asset-URLs im Webroot mit ?v=<git-hash>
#  (Cache-Busting: Spieler bekommen Updates sofort, alles
#  andere bleibt 1 h cachebar) und schreibt version.json,
#  über die das Spiel neue Versionen selbst erkennt.
#
#    ./deploy/stamp-version.sh [WEBROOT]     (Standard: /var/www/kingshot)
# ============================================================
set -euo pipefail

WEBROOT="${1:-/var/www/kingshot}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$WEBROOT/index.html" ]]; then
  echo "stamp-version: $WEBROOT/index.html nicht gefunden — übersprungen."
  exit 0
fi

# Version = kurzer Git-Hash, sonst Zeitstempel
VER=""
if [[ -d "$SRC_DIR/.git" ]] && command -v git >/dev/null 2>&1; then
  VER=$(git -C "$SRC_DIR" rev-parse --short HEAD 2>/dev/null || true)
fi
[[ -z "$VER" ]] && VER="t$(date +%s)"

# Asset-URLs stempeln (idempotent — ersetzt auch alte ?v=…)
sed -i -E \
  -e "s|(src=\"js/[a-z]+\.js)(\?v=[A-Za-z0-9]*)?\"|\1?v=${VER}\"|g" \
  -e "s|(href=\"css/style\.css)(\?v=[A-Za-z0-9]*)?\"|\1?v=${VER}\"|g" \
  "$WEBROOT/index.html"

printf '{"v":"%s","t":%s}\n' "$VER" "$(date +%s)" > "$WEBROOT/version.json"
chmod a+r "$WEBROOT/version.json"

echo "Version gestempelt: $VER"
