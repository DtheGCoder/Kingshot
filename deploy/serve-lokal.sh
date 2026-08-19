#!/usr/bin/env bash
# Schneller lokaler Test ohne nginx (z. B. auf dem eigenen PC):
#   ./deploy/serve-lokal.sh          → http://localhost:8080
#   ./deploy/serve-lokal.sh 9000     → http://localhost:9000
set -euo pipefail
PORT="${1:-8080}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
echo "🏰 KINGSHOT läuft auf  http://localhost:${PORT}  (Strg+C zum Beenden)"
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 0.0.0.0
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT" --bind 0.0.0.0
else
  echo "❌ python3 nicht gefunden — bitte installieren oder nginx nutzen."
  exit 1
fi
