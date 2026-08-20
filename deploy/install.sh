#!/usr/bin/env bash
# ============================================================
#  KINGSHOT — nginx-Installation (mit HTTPS & Härtung)
#  Richtet das Spiel als EIGENE nginx-Site ein, ohne bestehende
#  Sites anzufassen (eigene Conf-Datei, eigener Port/Domain).
#  Vor jedem Neuladen: nginx -t — schlägt der Test fehl, wird
#  die Änderung automatisch zurückgenommen.
#
#  Empfohlen (HTTPS mit Let's-Encrypt/Certbot):
#    sudo ./deploy/install.sh --domain kingshot.deine-domain.de
#      → nutzt ein vorhandenes Zertifikat automatisch (auch Wildcard)
#      → oder holt eines per  certbot certonly --webroot
#      → HTTP wird auf HTTPS umgeleitet, TLS 1.2/1.3, HSTS, CSP
#
#  Weitere Varianten:
#    sudo ./deploy/install.sh                          # nur HTTP, Port 8090
#    sudo ./deploy/install.sh --port 8181              # nur HTTP, anderer Port
#    sudo ./deploy/install.sh --domain D --no-https    # Domain, aber nur HTTP
#    sudo ./deploy/install.sh --domain D --email a@b.de     # E-Mail für erste Certbot-Registrierung
#    sudo ./deploy/install.sh --domain D --cert PFAD --key PFAD  # eigenes Zertifikat
#    sudo ./deploy/install.sh --install-nginx          # nginx mitinstallieren
#    sudo ./deploy/install.sh --force                  # fremdes Webroot trotzdem nutzen
# ============================================================
set -euo pipefail

PORT=8090
DOMAIN=""
WEBROOT="/var/www/kingshot"
SITE_NAME="kingshot"
INSTALL_NGINX=0
NO_HTTPS=0
CERT=""
KEY=""
EMAIL=""
FORCE=0

# ---------- Argumente ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)    PORT="$2"; shift 2 ;;
    --domain)  DOMAIN="$2"; shift 2 ;;
    --root)    WEBROOT="$2"; shift 2 ;;
    --cert)    CERT="$2"; shift 2 ;;
    --key)     KEY="$2"; shift 2 ;;
    --email)   EMAIL="$2"; shift 2 ;;
    --no-https) NO_HTTPS=1; shift ;;
    --install-nginx) INSTALL_NGINX=1; shift ;;
    --force)   FORCE=1; shift ;;
    -h|--help)
      grep '^#' "$0" | head -22; exit 0 ;;
    *) echo "Unbekannte Option: $1 (siehe --help)"; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "❌ Bitte als root ausführen:  sudo $0 $*"
  exit 1
fi
if [[ -n "$CERT" && -z "$KEY" ]] || [[ -z "$CERT" && -n "$KEY" ]]; then
  echo "❌ --cert und --key müssen zusammen angegeben werden."
  exit 1
fi
if [[ -n "$CERT" && -z "$DOMAIN" ]]; then
  echo "❌ --cert/--key brauchen auch --domain."
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
if [[ -n "$DOMAIN" ]]; then
  echo "    Domain:   $DOMAIN $( [[ $NO_HTTPS -eq 1 ]] && echo '(nur HTTP)' || echo '(HTTPS)')"
else
  echo "    Port:     $PORT (nur HTTP — für HTTPS:  --domain deine-domain.de)"
fi
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

CONF_DEB="/etc/nginx/sites-available/${SITE_NAME}.conf"
CONF_RHEL="/etc/nginx/conf.d/${SITE_NAME}.conf"

# ---------- Konflikte prüfen ----------
if [[ -z "$DOMAIN" ]]; then
  CONFLICT=$(grep -RslE "^[^#]*listen[^;]*[ :]${PORT}([; ])" /etc/nginx/ 2>/dev/null \
    | grep -v "${SITE_NAME}.conf" || true)
  if [[ -n "$CONFLICT" ]]; then
    echo "❌ Port ${PORT} wird bereits von einer anderen nginx-Site benutzt:"
    echo "$CONFLICT" | sed 's/^/     /'
    echo "   Anderen Port wählen:  sudo $0 --port 8181"
    exit 1
  fi
else
  # server_name darf nicht schon woanders vergeben sein
  NAME_CONFLICT=$(grep -RslE "^[^#]*server_name[^;]*(^|[ \t])${DOMAIN//./\\.}([ \t;])" /etc/nginx/ 2>/dev/null \
    | grep -v "${SITE_NAME}.conf" || true)
  if [[ -n "$NAME_CONFLICT" ]]; then
    echo "❌ Die Domain ${DOMAIN} wird bereits in einer anderen nginx-Site benutzt:"
    echo "$NAME_CONFLICT" | sed 's/^/     /'
    echo "   Bitte eine eigene (Sub-)Domain für Kingshot verwenden, z. B. kingshot.${DOMAIN#*.}"
    exit 1
  fi
fi

# ---------- Rückfall-Server prüfen ----------
# nginx beantwortet Anfragen an unbekannte Domains mit dem ERSTEN Block auf
# dem Port ("impliziter Default-Server"). Ist auf 443 nirgends default_server
# gesetzt, kann Kingshot je nach Ladereihenfolge zum Rückfall werden und
# fremden Domains sein Zertifikat zeigen — die sehen dann eine
# Zertifikatswarnung, obwohl mit ihrer Config alles stimmt.
warn_default_server() {
  local port="$1" others
  others=$(grep -RlE "^[^#]*listen[^;]*[ :]${port}([; ]|$)" /etc/nginx/ 2>/dev/null            | grep -v "${SITE_NAME}\.conf" | grep -v '\.bak$' || true)
  [[ -z "$others" ]] && return 0
  if grep -RqsE "^[^#]*listen[^;]*[ :]${port}[^;]*default_server" /etc/nginx/ 2>/dev/null; then
    return 0    # jemand hat den Rückfall schon beansprucht — alles gut
  fi
  echo
  echo "⚠️  Auf Port ${port} laufen schon andere Sites, aber keine ist als"
  echo "    default_server markiert:"
  echo "$others" | head -5 | sed 's/^/      /'
  echo "    Dann entscheidet die Ladereihenfolge, wer Anfragen an unbekannte"
  echo "    Domains beantwortet — im Zweifel Kingshot. Damit deine Hauptseite"
  echo "    der Rückfall bleibt, dort einmalig ergänzen:"
  echo "      listen ${port}${2:+ $2} default_server;"
  echo
}

# ---------- Webroot-Schutz ----------
# Das Kopieren räumt css/, js/ und assets/ im Webroot auf. Zeigt --root
# versehentlich auf ein Verzeichnis, in dem schon eine ANDERE Seite liegt,
# wären deren Dateien weg. Also vorher prüfen, wem das Verzeichnis gehört.
if [[ -d "$WEBROOT" ]] && [[ -n "$(ls -A "$WEBROOT" 2>/dev/null)" ]]; then
  if [[ ! -f "$WEBROOT/js/game.js" && ! -f "$WEBROOT/version.json" ]]; then
    echo "❌ ${WEBROOT} ist nicht leer und sieht nicht nach einer früheren"
    echo "   Kingshot-Installation aus. Dort liegt offenbar eine andere Seite:"
    ls -A "$WEBROOT" | head -8 | sed 's/^/     /'
    echo
    echo "   Das Kopieren würde dort css/, js/ und assets/ ersetzen."
    echo "   Nimm ein eigenes Verzeichnis, z. B.:"
    echo "     sudo $0 --root /var/www/kingshot ${DOMAIN:+--domain $DOMAIN}"
    echo "   Wenn du wirklich genau dieses Verzeichnis willst:  --force"
    [[ $FORCE -eq 0 ]] && exit 1
    echo "   ⚠️  --force gesetzt — mache trotzdem weiter."
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
# Gewähltes Webroot merken → update.sh/auto-update.sh deployen später dorthin
printf 'WEBROOT=%s\n' "$WEBROOT" > /etc/kingshot.conf
chmod 644 /etc/kingshot.conf
# Cache-Busting-Stempel + version.json (für Auto-Update-Erkennung im Spiel)
"$SRC_DIR/deploy/stamp-version.sh" "$WEBROOT" || true
# Webroot gehört root, Webserver darf nur LESEN (kein Schreibzugriff für www-data)
chown -R root:root "$WEBROOT"
chmod -R a+rX,go-w "$WEBROOT"
echo "✅ Spieldateien nach $WEBROOT kopiert (nur lesbar für den Webserver)."

# ---------- IPv6 nur einbinden, wenn der Server es unterstützt ----------
HAS_IPV6=0
[[ -f /proc/net/if_inet6 && -s /proc/net/if_inet6 ]] && HAS_IPV6=1

# ---------- Sicherheits-Header (für alle Varianten identisch) ----------
# Strikte CSP: Das Spiel ist reines Vanilla-JS ohne Inline-Skripte/-Styles.
# Erlaubt sind nur eigene Dateien + Google Fonts (Schriftart, optional).
CSP="default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; manifest-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"

security_headers() {
  cat <<EOF
    # --- Sicherheits-Header ---
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
    add_header Content-Security-Policy "${CSP}" always;
EOF
}

# Gemeinsame Auslieferungs-Regeln (keine add_header in Locations,
# damit die Server-Header überall erhalten bleiben!)
site_locations() {
  cat <<EOF
    location / {
        try_files \$uri \$uri/ =404;
    }

    # index.html nie hart cachen → Updates kommen sofort an
    location = /index.html {
        expires epoch;
    }

    # Versionsdatei nie cachen (Auto-Update-Erkennung im Spiel)
    location = /version.json {
        expires epoch;
    }

    location ~* \\.(js|css|svg|webmanifest)\$ {
        expires 1h;
    }

    # Versteckte Dateien niemals ausliefern
    location ~ /\\. {
        deny all;
    }
EOF
}

# ---------- Zertifikat finden / besorgen (Domain-Modus) ----------
CERT_DIR=""
find_le_cert() {
  # 1) exakt passendes live-Verzeichnis
  if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
    return 0
  fi
  # 2) irgendein Zertifikat, das die Domain abdeckt (auch Wildcard)
  command -v openssl >/dev/null 2>&1 || return 1
  local wild="*.${DOMAIN#*.}"
  local d sans
  for d in /etc/letsencrypt/live/*/; do
    [[ -f "${d}fullchain.pem" ]] || continue
    sans=$(openssl x509 -in "${d}fullchain.pem" -noout -ext subjectAltName 2>/dev/null || true)
    if grep -qE "DNS:${DOMAIN//./\\.}(,|[[:space:]]|\$)" <<<"$sans" \
       || grep -qF "DNS:${wild}" <<<"$sans"; then
      CERT_DIR="${d%/}"
      return 0
    fi
  done
  return 1
}

USE_HTTPS=0
if [[ -n "$DOMAIN" && $NO_HTTPS -eq 0 ]]; then
  if [[ -n "$CERT" ]]; then
    [[ -f "$CERT" && -f "$KEY" ]] || { echo "❌ Zertifikat/Key nicht gefunden: $CERT / $KEY"; exit 1; }
    USE_HTTPS=1
    echo "🔐 Nutze angegebenes Zertifikat: $CERT"
  elif find_le_cert; then
    CERT="${CERT_DIR}/fullchain.pem"
    KEY="${CERT_DIR}/privkey.pem"
    USE_HTTPS=1
    echo "🔐 Vorhandenes Let's-Encrypt-Zertifikat gefunden: $CERT_DIR"
  fi
fi

# ---------- Conf-Schreiben mit Test & automatischem Rollback ----------
TARGET_CONF=""
detect_layout() {
  if [[ -d /etc/nginx/sites-available ]] && grep -qs "sites-enabled" /etc/nginx/nginx.conf; then
    TARGET_CONF="$CONF_DEB"
  elif [[ -d /etc/nginx/conf.d ]]; then
    TARGET_CONF="$CONF_RHEL"
  else
    echo "❌ Unbekanntes nginx-Layout (weder sites-available noch conf.d gefunden)."
    exit 1
  fi
}
detect_layout

write_conf_and_reload() {  # $1 = Conf-Inhalt
  local had_backup=0
  if [[ -f "$TARGET_CONF" ]]; then cp "$TARGET_CONF" "${TARGET_CONF}.bak"; had_backup=1; fi
  printf '%s' "$1" > "$TARGET_CONF"
  if [[ "$TARGET_CONF" == "$CONF_DEB" ]]; then
    ln -sf "$TARGET_CONF" "/etc/nginx/sites-enabled/${SITE_NAME}.conf"
  fi
  if nginx -t 2>&1; then
    systemctl reload nginx 2>/dev/null || nginx -s reload
    rm -f "${TARGET_CONF}.bak"
    return 0
  fi
  echo "❌ nginx-Konfigurationstest fehlgeschlagen — mache Änderung rückgängig…"
  if [[ $had_backup -eq 1 ]]; then mv "${TARGET_CONF}.bak" "$TARGET_CONF"
  else rm -f "$TARGET_CONF" "/etc/nginx/sites-enabled/${SITE_NAME}.conf"; fi
  nginx -t >/dev/null 2>&1 && (systemctl reload nginx 2>/dev/null || nginx -s reload) || true
  return 1
}

# ---------- HTTP-Konfiguration (Port-Modus oder Vorstufe für HTTPS) ----------
build_http_conf() {  # $1 = listen-Zeilen  $2 = server_name
  cat <<EOF
# KINGSHOT — automatisch erzeugt von deploy/install.sh
server {
$1
    server_name $2;

    root ${WEBROOT};
    index index.html;
    server_tokens off;

$(security_headers)

    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/manifest+json;
    gzip_min_length 512;

    # Let's-Encrypt-Verlängerungen immer erlauben
    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
    }

$(site_locations)
}
EOF
}

# ---------- HTTPS-Konfiguration (Redirect + TLS-Server) ----------
build_https_conf() {
  local l80="    listen 80;"
  local l443="    listen 443 ssl;"
  if [[ $HAS_IPV6 -eq 1 ]]; then
    l80="$l80
    listen [::]:80;"
    l443="$l443
    listen [::]:443 ssl;"
  fi
  # TLS-Basis: Certbot-Optionsdatei nutzen, wenn vorhanden — sonst sichere Defaults
  local tls_block
  if [[ -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
    tls_block="    include /etc/letsencrypt/options-ssl-nginx.conf;"
  else
    tls_block="    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_session_timeout 1d;
    ssl_session_cache shared:KingshotSSL:1m;
    ssl_session_tickets off;"
  fi
  local dhparam=""
  [[ -f /etc/letsencrypt/ssl-dhparams.pem ]] && dhparam="    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"

  cat <<EOF
# KINGSHOT — automatisch erzeugt von deploy/install.sh
# HTTP: nur ACME-Verlängerung + Umleitung auf HTTPS
server {
$l80
    server_name ${DOMAIN};
    server_tokens off;

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
$l443
    server_name ${DOMAIN};

    ssl_certificate     ${CERT};
    ssl_certificate_key ${KEY};
$tls_block
$dhparam

    root ${WEBROOT};
    index index.html;
    server_tokens off;

    # HSTS: Browser erzwingen HTTPS für diese Domain (1 Jahr)
    add_header Strict-Transport-Security "max-age=31536000" always;
$(security_headers)

    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/manifest+json;
    gzip_min_length 512;

$(site_locations)
}
EOF
}

# ---------- Anwenden ----------
if [[ -n "$DOMAIN" && $NO_HTTPS -eq 0 && $USE_HTTPS -eq 0 ]]; then
  # Noch kein Zertifikat: erst HTTP-Site aktivieren (für die ACME-Challenge),
  # dann Certbot versuchen.
  L80="    listen 80;"
  [[ $HAS_IPV6 -eq 1 ]] && L80="$L80
    listen [::]:80;"
  write_conf_and_reload "$(build_http_conf "$L80" "$DOMAIN")" || exit 1
  echo "🌐 HTTP-Site aktiv — versuche Zertifikat über Certbot zu holen…"
  if command -v certbot >/dev/null 2>&1; then
    CB_ARGS=(certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --non-interactive)
    [[ -n "$EMAIL" ]] && CB_ARGS+=(--agree-tos -m "$EMAIL")
    if certbot "${CB_ARGS[@]}"; then
      if find_le_cert; then
        CERT="${CERT_DIR}/fullchain.pem"
        KEY="${CERT_DIR}/privkey.pem"
        USE_HTTPS=1
        echo "🔐 Zertifikat erfolgreich ausgestellt: $CERT_DIR"
      fi
    else
      echo
      echo "⚠️  Certbot konnte kein Zertifikat ausstellen (DNS zeigt evtl. noch nicht auf diesen Server,"
      echo "    Port 80 ist von außen nicht erreichbar, oder es fehlt --email für die Erstregistrierung)."
      echo "    Die Seite läuft vorerst über HTTP. Später einfach ausführen:"
      echo "      sudo certbot certonly --webroot -w ${WEBROOT} -d ${DOMAIN}"
      echo "      sudo ./deploy/install.sh --domain ${DOMAIN}"
    fi
  else
    echo "⚠️  certbot ist nicht installiert — Seite läuft vorerst über HTTP."
    echo "    Installieren (Debian/Ubuntu):  sudo apt install certbot"
  fi
fi

if [[ $USE_HTTPS -eq 1 ]]; then
  warn_default_server 443 ssl
  warn_default_server 80
  write_conf_and_reload "$(build_https_conf)" || exit 1
  echo "✅ HTTPS-Site aktiv: $TARGET_CONF"
  # Nach Zertifikats-Verlängerung nginx automatisch neu laden
  HOOK_DIR="/etc/letsencrypt/renewal-hooks/deploy"
  if [[ -d /etc/letsencrypt ]] && ! grep -Rqs "nginx" "$HOOK_DIR" 2>/dev/null; then
    mkdir -p "$HOOK_DIR"
    cat > "${HOOK_DIR}/reload-nginx.sh" <<'HOOK'
#!/bin/sh
# Von Kingshot-Install angelegt: nginx nach Zertifikats-Verlängerung neu laden
nginx -t && { systemctl reload nginx 2>/dev/null || nginx -s reload; }
HOOK
    chmod +x "${HOOK_DIR}/reload-nginx.sh"
    echo "🔁 Renewal-Hook angelegt: nginx lädt nach Zertifikats-Verlängerung automatisch neu."
  fi
elif [[ -n "$DOMAIN" && $NO_HTTPS -eq 1 ]]; then
  L80="    listen 80;"
  [[ $HAS_IPV6 -eq 1 ]] && L80="$L80
    listen [::]:80;"
  write_conf_and_reload "$(build_http_conf "$L80" "$DOMAIN")" || exit 1
  echo "✅ HTTP-Site aktiv: $TARGET_CONF"
elif [[ -z "$DOMAIN" ]]; then
  LP="    listen ${PORT};"
  [[ $HAS_IPV6 -eq 1 ]] && LP="$LP
    listen [::]:${PORT};"
  write_conf_and_reload "$(build_http_conf "$LP" "_")" || exit 1
  echo "✅ HTTP-Site aktiv (Port ${PORT}): $TARGET_CONF"
fi

# ---------- SELinux (RHEL/CentOS/Fedora) ----------
if command -v getenforce >/dev/null 2>&1 && [[ "$(getenforce)" == "Enforcing" ]]; then
  echo "🔐 SELinux aktiv — setze Kontexte…"
  command -v restorecon >/dev/null 2>&1 && restorecon -R "$WEBROOT" || true
  if [[ -z "$DOMAIN" ]] && command -v semanage >/dev/null 2>&1; then
    semanage port -a -t http_port_t -p tcp "$PORT" 2>/dev/null \
      || semanage port -m -t http_port_t -p tcp "$PORT" 2>/dev/null || true
  fi
fi

# ---------- Firewall-Hinweise ----------
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  if [[ -n "$DOMAIN" ]]; then
    ufw status | grep -qE "(^80|^443|Nginx Full|80/tcp|443/tcp)" \
      || echo "🧱 ufw aktiv — Ports freigeben:   sudo ufw allow 80/tcp && sudo ufw allow 443/tcp"
  else
    echo "🧱 ufw aktiv — Port freigeben:   sudo ufw allow ${PORT}/tcp"
  fi
fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  if [[ -n "$DOMAIN" ]]; then
    echo "🧱 firewalld: ggf.  sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload"
  else
    echo "🧱 firewalld: ggf.  sudo firewall-cmd --permanent --add-port=${PORT}/tcp && sudo firewall-cmd --reload"
  fi
fi

# ---------- Fertig ----------
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "🏰 =============================================="
echo "   KINGSHOT ist bereit!"
if [[ $USE_HTTPS -eq 1 ]]; then
  echo "   ▶  https://${DOMAIN}"
elif [[ -n "$DOMAIN" ]]; then
  echo "   ▶  http://${DOMAIN}"
else
  echo "   ▶  http://${IP:-<SERVER-IP>}:${PORT}"
fi
echo "   Updates einspielen:  sudo ./deploy/update.sh"
echo "   Auto-Update an:      sudo ./deploy/install-autoupdate.sh"
echo "   Deinstallieren:      sudo ./deploy/uninstall.sh"
echo "=============================================="
