#!/usr/bin/env bash
# ============================================================
#  KINGSHOT — Auto-Update-Prüfer (wird vom Timer/Cron gerufen)
#
#  Performant by design:
#   • EIN winziger Request (git ls-remote = nur der Ref-Hash,
#     kein Fetch, kein Clone) — ist nichts Neues da, passiert
#     exakt GAR NICHTS (kein Log, keine Disk-Writes).
#   • Nur bei neuem Commit: fetch + ff-only-Merge + Deploy.
#   • flock verhindert überlappende Läufe.
#   • Fehlgeschlagene Versionen werden gemerkt → kein Retry-Spam.
#
#  Log: /var/log/kingshot-update.log
# ============================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG="/var/log/kingshot-update.log"
LOCK="/var/lock/kingshot-update.lock"
FAIL_MARKER="/var/lib/kingshot/.last-failed-remote"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# Nur ein Lauf gleichzeitig
exec 9> "$LOCK" 2>/dev/null || exit 0
flock -n 9 || exit 0

command -v git >/dev/null 2>&1 || { log "git fehlt"; exit 0; }
cd "$REPO_DIR" || exit 0
[[ -d .git ]] || { log "$REPO_DIR ist kein Git-Repo"; exit 0; }

# Repo darf einem anderen Nutzer gehören
git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$REPO_DIR" \
  || git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]] && exit 0   # detached HEAD → nichts tun

LOCAL=$(git rev-parse HEAD 2>/dev/null) || exit 0

# ---- Der billige Check: nur den Remote-Hash holen ----
REMOTE=$(timeout 25 git ls-remote --heads origin "$BRANCH" 2>/dev/null | awk '{print $1; exit}')
[[ -z "$REMOTE" ]] && exit 0            # Netz nicht erreichbar → leise nächstes Mal
[[ "$REMOTE" == "$LOCAL" ]] && exit 0   # nichts Neues → fertig (häufigster Fall)

# Schon einmal gescheitert — und seither hat sich NICHTS geändert (weder auf
# GitHub noch lokal)? Dann still bleiben. Sobald der Admin das Repo aufräumt
# (lokaler Hash ändert sich) oder ein neuer Commit kommt, wird wieder versucht.
if [[ -f "$FAIL_MARKER" ]] && [[ "$(cat "$FAIL_MARKER" 2>/dev/null)" == "$REMOTE $LOCAL" ]]; then
  exit 0
fi

log "Neue Version auf GitHub: ${LOCAL:0:7} → ${REMOTE:0:7} — aktualisiere…"

if ! timeout 120 git fetch origin "$BRANCH" >> "$LOG" 2>&1; then
  log "FEHLER: git fetch fehlgeschlagen (Netz?)"
  exit 0
fi
if ! git merge --ff-only "origin/$BRANCH" >> "$LOG" 2>&1; then
  log "FEHLER: Kein Fast-Forward möglich — lokale Änderungen im Repo blockieren das Update."
  mkdir -p "$(dirname "$FAIL_MARKER")"
  echo "$REMOTE $LOCAL" > "$FAIL_MARKER"
  exit 1
fi

if "$SCRIPT_DIR/update.sh" --deploy-only >> "$LOG" 2>&1; then
  rm -f "$FAIL_MARKER"
  log "OK: aktualisiert auf $(git rev-parse --short HEAD)"
else
  log "FEHLER: Deploy fehlgeschlagen — Details oben."
  mkdir -p "$(dirname "$FAIL_MARKER")"
  echo "$REMOTE $LOCAL" > "$FAIL_MARKER"
fi

# Log klein halten
if [[ -f "$LOG" ]] && [[ $(wc -l < "$LOG") -gt 500 ]]; then
  tail -n 300 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
