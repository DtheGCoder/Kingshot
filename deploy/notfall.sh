#!/usr/bin/env bash
#
#  KINGSHOT — Notfall & Diagnose
#  Nimmt die Kingshot-Site aus nginx heraus und stellt alles andere wieder
#  her. Ohne Argument wird nur DIAGNOSTIZIERT, nichts verändert.
#
#    sudo ./deploy/notfall.sh              # nur nachsehen, was los ist
#    sudo ./deploy/notfall.sh --aus        # Kingshot-Site abschalten, nginx neu laden
#    sudo ./deploy/notfall.sh --an         # wieder einschalten
#
set -uo pipefail
SITE_NAME="kingshot"
DEB_AVAIL="/etc/nginx/sites-available/${SITE_NAME}.conf"
DEB_LINK="/etc/nginx/sites-enabled/${SITE_NAME}.conf"
RHEL_CONF="/etc/nginx/conf.d/${SITE_NAME}.conf"
MODE="diagnose"
[[ "${1:-}" == "--aus" ]] && MODE="aus"
[[ "${1:-}" == "--an" ]]  && MODE="an"

if [[ $EUID -ne 0 ]]; then echo "❌ Bitte mit sudo ausführen."; exit 1; fi

line() { printf '%s\n' "────────────────────────────────────────────"; }

if [[ "$MODE" == "aus" ]]; then
  echo "🔌 Schalte die Kingshot-Site ab…"
  [[ -L "$DEB_LINK" || -f "$DEB_LINK" ]] && rm -f "$DEB_LINK" && echo "   entfernt: $DEB_LINK"
  if [[ -f "$RHEL_CONF" ]]; then mv "$RHEL_CONF" "${RHEL_CONF}.aus" && echo "   deaktiviert: ${RHEL_CONF}.aus"; fi
  if nginx -t 2>&1; then
    systemctl reload nginx 2>/dev/null || nginx -s reload || systemctl start nginx
    echo "✅ nginx läuft wieder ohne Kingshot. Deine anderen Seiten sollten da sein."
  else
    echo "❗ nginx -t meldet weiter einen Fehler — der kommt dann NICHT von Kingshot."
    echo "   Die Meldung oben zeigt, welche Datei und Zeile gemeint ist."
  fi
  exit 0
fi

if [[ "$MODE" == "an" ]]; then
  if [[ -f "${RHEL_CONF}.aus" ]]; then mv "${RHEL_CONF}.aus" "$RHEL_CONF"; fi
  if [[ -f "$DEB_AVAIL" && -d /etc/nginx/sites-enabled ]]; then ln -sf "$DEB_AVAIL" "$DEB_LINK"; fi
  if nginx -t 2>&1; then
    systemctl reload nginx 2>/dev/null || nginx -s reload
    echo "✅ Kingshot-Site wieder aktiv."
  else
    echo "❌ Config-Test fehlgeschlagen — Site bleibt besser aus. Meldung siehe oben."
  fi
  exit 0
fi

# ---------- Diagnose ----------
line; echo "1) Läuft nginx?"; line
if pgrep -x nginx >/dev/null; then echo "   ✅ nginx-Prozess läuft"
else echo "   ❌ nginx läuft NICHT — deshalb geht keine Seite."; fi
systemctl is-active nginx 2>/dev/null | sed 's/^/   systemd: /' || true

line; echo "2) Ist die Konfiguration gültig?"; line
nginx -t 2>&1 | sed 's/^/   /'

line; echo "3) Welche Sites sind aktiv?"; line
for d in /etc/nginx/sites-enabled /etc/nginx/conf.d; do
  [[ -d "$d" ]] && ls -1 "$d" 2>/dev/null | sed "s|^|   $d/|"
done

line; echo "4) Gehört Kingshot dazu?"; line
if [[ -e "$DEB_LINK" || -f "$RHEL_CONF" ]]; then
  echo "   ja — Kingshot-Site ist aktiv"
  echo "   Zum Ausschließen als Ursache:  sudo $0 --aus"
else
  echo "   nein — Kingshot ist NICHT aktiv, die Ursache liegt woanders"
fi

line; echo "5) Wer beantwortet unbekannte Domains? (default_server)"; line
found=0
for p in 80 443; do
  if grep -RqsE "^[^#]*listen[^;]*[ :]${p}[^;]*default_server" /etc/nginx/ 2>/dev/null; then
    grep -RlsE "^[^#]*listen[^;]*[ :]${p}[^;]*default_server" /etc/nginx/ 2>/dev/null \
      | sed "s|^|   Port $p → |"
    found=1
  else
    echo "   Port $p → keiner gesetzt (dann gewinnt der erste Block — Reihenfolge nach Dateiname)"
  fi
done
[[ $found -eq 0 ]] && echo "   Tipp: bei deiner Hauptseite 'default_server' ergänzen, dann kann"
[[ $found -eq 0 ]] && echo "         keine andere Site versehentlich einspringen."

line; echo "6) Letzte Fehler im nginx-Log"; line
for f in /var/log/nginx/error.log /var/log/nginx/error.log.1; do
  [[ -f "$f" ]] && tail -n 12 "$f" | sed 's/^/   /' && break
done

line; echo "7) Belegte Ports"; line
(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E ':(80|443|8090)\b' | sed 's/^/   /' || echo "   (nichts auf 80/443/8090)"

line
echo "Nichts wurde verändert. Kingshot abschalten:  sudo $0 --aus"
