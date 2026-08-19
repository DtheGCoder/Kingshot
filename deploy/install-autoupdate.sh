#!/usr/bin/env bash
# ============================================================
#  KINGSHOT — Auto-Update einrichten
#  Prüft alle N Minuten GitHub auf eine neue Version und spielt
#  sie automatisch ein. Läuft als systemd-Timer mit niedriger
#  Priorität (Nice + IO-idle) — auf Servern ohne systemd als
#  Cron-Job. Der Check selbst ist ein einziger Mini-Request.
#
#    sudo ./deploy/install-autoupdate.sh                # alle 5 Minuten
#    sudo ./deploy/install-autoupdate.sh --interval 15  # alle 15 Minuten
#    sudo ./deploy/install-autoupdate.sh --uninstall
#
#  Status:  systemctl status kingshot-update.timer
#  Log:     tail -f /var/log/kingshot-update.log
# ============================================================
set -euo pipefail

INTERVAL=5
UNINSTALL=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) INTERVAL="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) grep '^#' "$0" | head -15; exit 0 ;;
    *) echo "Unbekannte Option: $1"; exit 1 ;;
  esac
done
[[ "$INTERVAL" =~ ^[0-9]+$ ]] && [[ "$INTERVAL" -ge 1 ]] || { echo "❌ --interval braucht Minuten ≥ 1"; exit 1; }

if [[ $EUID -ne 0 ]]; then
  echo "❌ Bitte als root ausführen:  sudo $0 $*"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SVC=/etc/systemd/system/kingshot-update.service
TMR=/etc/systemd/system/kingshot-update.timer
CRON=/etc/cron.d/kingshot-update

HAS_SYSTEMD=0
[[ -d /run/systemd/system ]] && command -v systemctl >/dev/null 2>&1 && HAS_SYSTEMD=1

# ---------- Deinstallation ----------
if [[ $UNINSTALL -eq 1 ]]; then
  if [[ $HAS_SYSTEMD -eq 1 ]]; then
    systemctl disable --now kingshot-update.timer 2>/dev/null || true
  fi
  rm -f "$SVC" "$TMR" "$CRON"
  [[ $HAS_SYSTEMD -eq 1 ]] && systemctl daemon-reload
  echo "Auto-Update entfernt."
  exit 0
fi

# ---------- Voraussetzungen ----------
command -v git >/dev/null 2>&1 || { echo "❌ git wird benötigt (sudo apt install git)"; exit 1; }
[[ -d "$REPO_DIR/.git" ]] || { echo "❌ $REPO_DIR ist kein Git-Repo — Auto-Update braucht das geklonte Repo."; exit 1; }
chmod +x "$SCRIPT_DIR/auto-update.sh" "$SCRIPT_DIR/update.sh" "$SCRIPT_DIR/stamp-version.sh" 2>/dev/null || true

if [[ $HAS_SYSTEMD -eq 1 ]]; then
  # ---------- systemd-Timer (empfohlen) ----------
  cat > "$SVC" <<EOF
[Unit]
Description=Kingshot Auto-Update (prüft GitHub auf neue Version)
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=${SCRIPT_DIR}/auto-update.sh
# Ressourcenschonend: niedrige CPU-/IO-Priorität, stört nginx nie
Nice=10
IOSchedulingClass=idle
EOF
  cat > "$TMR" <<EOF
[Unit]
Description=Kingshot Auto-Update Timer (alle ${INTERVAL} Minuten)

[Timer]
OnBootSec=2min
OnUnitActiveSec=${INTERVAL}min
RandomizedDelaySec=45

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now kingshot-update.timer
  echo "✅ Auto-Update aktiv (systemd-Timer, alle ${INTERVAL} Minuten)."
  echo "   Status:  systemctl status kingshot-update.timer"
  echo "   Log:     tail -f /var/log/kingshot-update.log"
else
  # ---------- Cron-Fallback ----------
  if [[ ! -d /etc/cron.d ]]; then
    echo "❌ Weder systemd noch /etc/cron.d gefunden — bitte cron installieren (sudo apt install cron)."
    exit 1
  fi
  cat > "$CRON" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/${INTERVAL} * * * * root ${SCRIPT_DIR}/auto-update.sh >/dev/null 2>&1
EOF
  chmod 644 "$CRON"
  echo "✅ Auto-Update aktiv (Cron, alle ${INTERVAL} Minuten)."
  echo "   Log:  tail -f /var/log/kingshot-update.log"
fi

echo
echo "Ablauf: Neuer Push auf GitHub → Server aktualisiert sich (≤ ${INTERVAL} min)"
echo "        → laufende Spiele erkennen die neue Version und laden sich selbst neu"
echo "        → dank Auto-Save geht es exakt an derselben Stelle weiter."
