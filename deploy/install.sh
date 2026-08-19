#!/usr/bin/env bash
# ============================================================
#  KINGSHOT — nginx-Installation
#  Richtet das Spiel als EIGENE nginx-Site ein, ohne bestehende
#  Sites anzufassen (eigene Conf-Datei, eigener Port/Domain).
#
#  Standard:  eigener Port 8090       → http://SERVER-IP:8090
#  Optional:  --domain spiel.beispiel.de  → eigener vHost auf Port 80
#
#  Beispiele:
#    sudo ./deploy/install.sh
#    sudo ./deploy/install.sh --port 8181
#    sudo ./deploy/install.sh --domain kingshot.meinserver.de
#    sudo ./deploy/install.sh --install-nginx        # nginx mitinstallieren
# ============================================================
set -euo pipefail

PORT=8090
DOMAIN=""
WEBROOT="/var/www/kingshot"
SITE_NAME="kingshot"
INSTALL_NGINX=0

# ---------- Argumente ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)    PORT="$2"; shift 2 ;;
    --domain)  DOMAIN="$2"; shift 2 ;;
    --root)    WEBROOT="$2"; shift 2 ;;
    --install-nginx) INSTALL_NGINX=1; shift ;;
    -h|--help)
      grep '^#' "$0" | head -18; exit 0 ;;
    *) echo "Unbekannte Option: $1 (siehe --help)"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "❌ Bitte als root ausführen:  sudo $0 $*"
  exit 1
fi

# Quellverzeichnis = Repo (eine Ebene über diesem Skript)
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -f "$SRC_DIR/index.html" ]]; then
  echo "❌ index.html nicht gefunden in $SRC_DIR — Skript aus dem Repo heraus starten."
  exit 1
fi

echo "⚔️  KINGSHOT wird installiert…"
echo "    Quelle:   $SRC_DIR"
echo "    Webroot:  $WEBROOT"
if [[ -n "$DOMAIN" ]]; then echo "    Domain:   $DOMAIN (Port 80)"; else echo "    Port:     $PORT"; fi
echo

# ---------- nginx vorhanden? ----------
if ! command -v nginx >/dev/null 2>&1; then
  if [[ $INSTALL_NGINX -eq 1 ]]; then
    echo "📦 Installiere nginx…"
    if command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y nginx
    elif command -v dnf >/dev/null 2>&1; then dnf install -y nginx
    elif command -v yum >/dev/null 2>&1; then yum install -y nginx
    elif command -v zypper >/dev/null 2>&1; then zypper install -y nginx
    elif command -v pacman >/dev/null 2>&1; then pacman -S --noconfirm nginx
    else echo "❌ Kein bekannter Paketmanager gefunden — bitte nginx manuell installieren."; exit 1
    fi
    systemctl enable --now nginx 2>/dev/null || true
  else
    echo "❌ nginx ist nicht installiert. Erneut ausführen mit:  sudo $0 --install-nginx"
    exit 1
  fi
fi

# ---------- Port-Konflikt prüfen (nur bei Port-Modus) ----------
CONF_DEB="/etc/nginx/sites-available/${SITE_NAME}.conf"
CONF_RHEL="/etc/nginx/conf.d/${SITE_NAME}.conf"
if [[ -z "$DOMAIN" ]]; then
  CONFLICT=$(grep -RslE "listen[^;]*[ :]${PORT}([; ])" /etc/nginx/ 2>/dev/null \
    | grep -v "${SITE_NAME}.conf" || true)
  if [[ -n "$CONFLICT" ]]; then
    echo "❌ Port ${PORT} wird bereits von einer anderen nginx-Site benutzt:"
    echo "$CONFLICT" | sed 's/^/     /'
    echo "   Anderen Port wählen:  sudo $0 --port 8181"
    exit 1
  fi
fi

# ---------- Spieldateien kopieren ----------
mkdir -p "$WEBROOT"
copy() {
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
}
copy
chmod -R a+rX "$WEBROOT"
echo "✅ Spieldateien nach $WEBROOT kopiert."

# ---------- nginx-Konfiguration schreiben (NUR eigene Datei) ----------
# IPv6 nur einbinden, wenn der Server es unterstützt
IPV6_LINE=""
if [[ -f /proc/net/if_inet6 ]] && [[ -s /proc/net/if_inet6 ]]; then
  if [[ -n "$DOMAIN" ]]; then IPV6_LINE="
    listen [::]:80;"; else IPV6_LINE="
    listen [::]:${PORT};"; fi
fi
if [[ -n "$DOMAIN" ]]; then
  LISTEN_BLOCK="    listen 80;${IPV6_LINE}
    server_name ${DOMAIN};"
else
  LISTEN_BLOCK="    listen ${PORT};${IPV6_LINE}
    server_name _;"
fi

NGINX_CONF="server {
${LISTEN_BLOCK}

    root ${WEBROOT};
    index index.html;

    # Sicherheits-Header (nur für diese Site)
    add_header X-Content-Type-Options nosniff;

    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/manifest+json;
    gzip_min_length 512;

    location / {
        try_files \$uri \$uri/ =404;
    }

    # index.html nie hart cachen → Updates kommen sofort an
    location = /index.html {
        add_header Cache-Control \"no-cache\";
    }

    location ~* \\.(js|css|svg|webmanifest)\$ {
        expires 1h;
        add_header Cache-Control \"public\";
    }
}
"

# Layout erkennen: Debian/Ubuntu (sites-*) oder RHEL/Fedora/Arch (conf.d)
TARGET_CONF=""
if [[ -d /etc/nginx/sites-available ]] && grep -qs "sites-enabled" /etc/nginx/nginx.conf; then
  TARGET_CONF="$CONF_DEB"
  [[ -f "$TARGET_CONF" ]] && cp "$TARGET_CONF" "${TARGET_CONF}.bak"
  printf '%s' "$NGINX_CONF" > "$TARGET_CONF"
  ln -sf "$TARGET_CONF" "/etc/nginx/sites-enabled/${SITE_NAME}.conf"
elif [[ -d /etc/nginx/conf.d ]]; then
  TARGET_CONF="$CONF_RHEL"
  [[ -f "$TARGET_CONF" ]] && cp "$TARGET_CONF" "${TARGET_CONF}.bak"
  printf '%s' "$NGINX_CONF" > "$TARGET_CONF"
else
  echo "❌ Unbekanntes nginx-Layout (weder sites-available noch conf.d gefunden)."
  exit 1
fi
echo "✅ nginx-Site geschrieben: $TARGET_CONF"

# ---------- SELinux (RHEL/CentOS/Fedora) ----------
if command -v getenforce >/dev/null 2>&1 && [[ "$(getenforce)" == "Enforcing" ]]; then
  echo "🔐 SELinux aktiv — setze Kontexte…"
  command -v restorecon >/dev/null 2>&1 && restorecon -R "$WEBROOT" || true
  if [[ -z "$DOMAIN" ]] && command -v semanage >/dev/null 2>&1; then
    semanage port -a -t http_port_t -p tcp "$PORT" 2>/dev/null \
      || semanage port -m -t http_port_t -p tcp "$PORT" 2>/dev/null || true
  fi
fi

# ---------- Testen & sanft neu laden (bestehende Sites bleiben unberührt) ----------
if nginx -t; then
  systemctl reload nginx 2>/dev/null || nginx -s reload
  echo "✅ nginx neu geladen."
else
  echo "❌ nginx-Konfigurationstest fehlgeschlagen — mache Änderung rückgängig…"
  if [[ -f "${TARGET_CONF}.bak" ]]; then mv "${TARGET_CONF}.bak" "$TARGET_CONF"
  else rm -f "$TARGET_CONF" "/etc/nginx/sites-enabled/${SITE_NAME}.conf"; fi
  nginx -t && (systemctl reload nginx 2>/dev/null || nginx -s reload) || true
  exit 1
fi
rm -f "${TARGET_CONF}.bak"

# ---------- Firewall-Hinweise ----------
if [[ -z "$DOMAIN" ]]; then
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    echo "🧱 ufw ist aktiv — Port freigeben mit:   sudo ufw allow ${PORT}/tcp"
  fi
  if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    echo "🧱 firewalld aktiv — Port freigeben mit: sudo firewall-cmd --permanent --add-port=${PORT}/tcp && sudo firewall-cmd --reload"
  fi
fi

# ---------- Fertig ----------
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "🏰 =============================================="
echo "   KINGSHOT ist bereit!"
if [[ -n "$DOMAIN" ]]; then
  echo "   ▶  http://${DOMAIN}"
else
  echo "   ▶  http://${IP:-<SERVER-IP>}:${PORT}"
fi
echo "   Updates einspielen:  sudo ./deploy/update.sh"
echo "   Deinstallieren:      sudo ./deploy/uninstall.sh"
echo "=============================================="
