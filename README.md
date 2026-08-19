# 👑 KINGSHOT — Verteidige das letzte Königreich

Ein komplettes Browser-Spiel im Stil der berühmten „Kingshot“-Werbung: Du steuerst den König
direkt mit einem unsichtbaren Joystick, verteidigst deine Burg gegen endlose Monsterwellen,
sammelst die Goldmünzen deiner besiegten Feinde ein — und lässt sie **extrem satisfying**
auf Bauplatten regnen, um Türme, Minen, Tavernen und mehr durch viele Stufen auszubauen.

Kein Build-Tool, keine Abhängigkeiten, kein Backend — pures HTML5/Canvas/JavaScript.
Läuft auf jedem Handy und Desktop-Browser, direkt von deinem eigenen nginx-Server.

| | | |
|---|---|---|
| ![Titel](docs/screenshots/titel.jpg) | ![Start](docs/screenshots/start.jpg) | ![Nachtkampf](docs/screenshots/nacht-kampf.jpg) |
| ![Königreich](docs/screenshots/koenigreich.jpg) | ![Belagerung](docs/screenshots/belagerung.jpg) | ![Markt](docs/screenshots/markt.jpg) |
| ![Bauen bestätigen](docs/screenshots/bauen.jpg) | ![Stadttore](docs/screenshots/tore.jpg) | |

![Desktop](docs/screenshots/desktop.jpg)

---

## 🚀 Installation auf dem Linux-Server (nginx, HTTPS)

Das Install-Skript legt eine **eigene** nginx-Site an (eigene Conf-Datei) und fasst
**keine bestehenden Sites an**. Vor jedem Neuladen wird `nginx -t` geprüft — schlägt
der Test fehl, wird die Änderung **automatisch zurückgenommen** und der alte Zustand
wiederhergestellt.

### Empfohlen: HTTPS mit eigener (Sub-)Domain

```bash
git clone https://github.com/DtheGCoder/Kingshot.git
cd Kingshot
sudo ./deploy/install.sh --domain kingshot.deine-domain.de
```

Fertig → **https://kingshot.deine-domain.de**

Das Skript kümmert sich komplett um HTTPS:
- **Vorhandene Let's-Encrypt-Zertifikate werden automatisch erkannt** und genutzt —
  auch Wildcard-Zertifikate (`*.deine-domain.de`)
- Fehlt ein Zertifikat, holt es eines per `certbot certonly --webroot`
  (bei allererster Certbot-Nutzung `--email deine@mail.de` mitgeben)
- HTTP wird per 301 auf HTTPS umgeleitet; der ACME-Pfad für
  **Zertifikats-Verlängerungen bleibt frei** und nginx lädt nach jeder
  Verlängerung automatisch neu (Renewal-Hook)
- Eigenes Zertifikat? `--cert /pfad/fullchain.pem --key /pfad/privkey.pem`

Voraussetzung: Die (Sub-)Domain zeigt per DNS (A-/AAAA-Record) auf den Server.

### Alternative: nur HTTP auf eigenem Port (z. B. zum Testen)

```bash
sudo ./deploy/install.sh                   # → http://SERVER-IP:8090
sudo ./deploy/install.sh --port 8181       # anderer Port
```

### Weitere Optionen

```bash
sudo ./deploy/install.sh --install-nginx                # nginx automatisch mitinstallieren
sudo ./deploy/install.sh --root /srv/www/kingshot       # anderes Webroot
sudo ./deploy/install.sh --domain D --no-https          # Domain, bewusst ohne TLS
```

### 🔒 Sicherheit — dein Server bleibt geschützt

- **Rein statische Site**: kein Backend, keine Datenbank, kein PHP, keine Uploads —
  der Server liefert nur Dateien aus. Spielstände liegen ausschließlich im Browser
  der Spieler (`localStorage`), auf dem Server wird nichts gespeichert.
- **TLS 1.2/1.3 only** mit modernen Cipher-Suiten (bzw. deiner Certbot-Standardkonfig)
  und **HSTS** (Browser erzwingen HTTPS für die Domain).
- **Strikte Content-Security-Policy** (`default-src 'none'` — nur eigene Skripte/Styles
  und Google Fonts erlaubt), dazu `nosniff`, `X-Frame-Options`, `Referrer-Policy`
  und `Permissions-Policy` (Kamera/Mikro/Standort komplett aus).
- Webroot gehört `root` und ist für den Webserver **nur lesbar** — selbst ein
  kompromittierter nginx-Worker könnte die Dateien nicht verändern.
- Versteckte Dateien (`/.…`) werden nie ausgeliefert, `server_tokens off`.
- Das Skript prüft vorab **Port- und Domain-Konflikte** mit bestehenden Sites und
  schreibt ausschließlich in seine eigene `kingshot.conf`.

### Updaten / Entfernen

```bash
sudo ./deploy/update.sh        # git pull + Dateien neu kopieren (Spielstände bleiben!)
sudo ./deploy/uninstall.sh     # nur die Kingshot-Site entfernen
sudo ./deploy/uninstall.sh --purge   # zusätzlich das Webroot löschen
```

### 🔄 Auto-Update — neue Versionen kommen von selbst

```bash
sudo ./deploy/install-autoupdate.sh              # prüft alle 5 Minuten
sudo ./deploy/install-autoupdate.sh --interval 15
sudo ./deploy/install-autoupdate.sh --uninstall
```

Danach genügt ein Push auf GitHub — der Rest passiert automatisch:

1. Der Server prüft im Takt, ob es eine neue Version gibt, und holt sie.
2. Spieldateien werden neu deployt und mit einem Versions-Stempel versehen.
3. **Laufende Spiele erkennen die neue Version und laden sich selbst neu** —
   dank Auto-Save geht es exakt an derselben Stelle weiter, sogar mitten
   in einer Bossnacht.

**Bewusst ressourcenschonend gebaut:**

- Der Check ist ein einziger winziger `git ls-remote`-Abgleich des Commit-Hashs
  (kein Fetch, kein Clone). Ist nichts Neues da, passiert **exakt gar nichts** —
  kein Download, kein Schreibzugriff, kein Log-Eintrag. Gemessen: **~30 ms** pro
  Leerlauf-Prüfung, ein vollständiges Update dauert ~130 ms.
- Der systemd-Timer läuft mit `Nice=10` und `IOSchedulingClass=idle`, kann deinen
  Webserver also nie ausbremsen. Ohne systemd wird automatisch ein Cron-Job genutzt.
- `flock` verhindert überlappende Läufe; das Log wird automatisch gekürzt.
- Blockieren lokale Änderungen im Repo den Fast-Forward, sagt das Log **einmal**
  klar, was los ist (kein Retry-Spam) — und sobald du aufgeräumt hast, wird das
  Update automatisch nachgeholt.
- Im Browser fragt das Spiel nur alle 5 Minuten eine ~30-Byte-Datei ab, und das
  nur im Vordergrund. Eine Reload-Bremse schließt Endlos-Neuladen aus.

```bash
systemctl status kingshot-update.timer   # läuft es?
tail -f /var/log/kingshot-update.log     # was ist passiert?
```

### Schnell lokal testen (ohne nginx)

```bash
./deploy/serve-lokal.sh        # → http://localhost:8080
```

---

## 🎮 So spielt es sich

- **Steuerung:** Finger irgendwo aufs Spielfeld legen → unsichtbarer Joystick erscheint
  genau dort. Am Desktop: **WASD** oder Pfeiltasten. Der König greift automatisch an.
- **Gold:** Jedes besiegte Monster lässt Münzen fallen — einfach hindurchlaufen,
  der Magnet zieht sie an.
- **Bauen:** Stell dich auf eine Bauplatte → unten erscheint ein Knopf
  („Wachturm Nord bauen · 60"). Erst **ein Druck darauf** lässt die Münzen fließen
  (immer schneller!) — Vorbeilaufen kostet **nie** Gold. Nochmal drücken hält an,
  Weggehen bricht ab. Reicht das Gold nicht, bleibt der Fortschritt gespeichert
  und die Platte zeigt, **wie viel noch fehlt**. Am Desktop geht auch **Leertaste**;
  alternativ tippst du direkt auf das Gebäude.
- **Tag & Nacht:** Tagsüber bauen, sammeln und produzieren — nachts kommt die Flut.
  Alle 5 Nächte wartet ein **Boss**.
- **Niederlage?** Halb so wild: Der König steht wieder auf, die Burg wird notdürftig
  geflickt, ein Teil des getragenen Goldes geht verloren — weiter geht's am selben Tag.

## 🏰 Gebäude (je 10 Stufen, mit sichtbarer Evolution: Holz → Stein → Eisen → Gold → Kristall)

| Gebäude | Wirkung |
|---|---|
| 🏰 **Burg** | Herzstück — mehr HP, heilt sich langsam selbst |
| 🏹 **Wachtürme** (3×) | Schnelle Pfeile |
| 💣 **Kanonentürme** (2×) | Flächenschaden |
| ❄️ **Frostturm** | Verlangsamt Feinde |
| ⚡ **Blitzturm** | Kettenblitze über mehrere Ziele |
| 🔥 **Flammenturm** | Feuerkegel + Brandschaden |
| ⛏️ **Goldminen** (2×) | Produzieren laufend Münzen zum Abholen |
| 🍺 **Tavernen** (2×) | Beherbergen Überlebende, die Steuern zahlen |
| ⚒️ **Schmiede** | Schmiedet 10 immer mächtigere Königsklingen (ab Stufe 5 mit Klingenwelle!) |
| 🛒 **Markt** | Shop mit 6 dauerhaften König-Upgrades: Leben, Tempo, Magnet, Krit, Gold, Rüstung. Öffnet per Tipp aufs Gebäude — solange er offen ist, **ruht das ganze Spiel** |
| 🧱 **Stadtmauer** | Ring aus 16 Abschnitten mit eigenen HP — Monster brechen einzelne Abschnitte durch, morgens wird repariert |
| 🚪 **Stadttore** | Verschließen alle acht Durchgänge, sonst spaziert die Horde einfach hindurch. Eigene HP, werden aufgebrochen und im Morgengrauen wieder eingesetzt |
| ✨ **Schrein des Lichts** | Heil-Aura für König und Burg |

## 👹 Monster — 24 Arten in 12 Klassen + 10 Bosse

Von **Klasse 1** (Grünschleim, ganz harmlos) über Goblins, Spinnen, Untote, Orks,
Schattenwölfe, Trolle und Golems bis zu Dämonen und **Klasse 12** (Junge Drachen).
Monster werden mit jedem Tag stärker *und sichtbar größer*; ab Tag 12 erscheinen
goldene **Elite**-Varianten. Bosse alle 5 Nächte: Schleimkönig, Goblin-Häuptling,
Spinnenkönigin, Knochenfürst, Ork-Kriegsherr, Trollkönig, Golem-Koloss, Dämonenfürst,
Drachenmutter — und in Nacht 50 der **Weltenfresser**.

## 📖 Der rote Faden

10 Story-Kapitel mit ~40 Quests führen vom ersten Funken („Sammle 50 Münzen“) bis zum
neuen Königreich — jedes Kapitel bringt eine kleine Geschichte, neue Bauplätze, neue
Monsterklassen und einen Boss. Danach beginnt die **Ewige Wacht**: endlose Nächte,
rotierende, immer stärkere Bosse und generierte Meilenstein-Quests. In der Chronik
(⚙️-Menü) kannst du deine ganze Legende nachlesen.

## 💾 Auto-Save — wirklich lückenlos

- Speichert **alle 2 Sekunden** sowie bei jedem wichtigen Ereignis
- Zusätzlich beim Verlassen/Minimieren der Seite (`pagehide`, `beforeunload`, Tab-Wechsel)
- **Doppelter Speicherslot**: ein korrupter Slot kann nie den Spielstand zerstören
- Browser abstürzen lassen, Tab schließen, Handy neustarten — beim nächsten Öffnen
  geht es **exakt an derselben Stelle** weiter, sogar mitten in einer Bossnacht
  (Monster stehen wieder da, wo sie standen)
- Spielstand-Export/-Import als Text im ⚙️-Menü (z. B. für Gerätewechsel)

> Der Spielstand liegt im `localStorage` des Browsers — er gehört zur Domain/Port-Kombination.
> Wenn du das Spiel später auf einen anderen Port/eine Domain umziehst, nutze vorher den Export.

## 🛠️ Technik

- Vanilla JS + Canvas 2D, flüssig auch auf Mobilgeräten (Sprite-Caching, Spatial-Hashing, Objekt-Pools)
- **Automatische Qualitätsanpassung:** Bricht die Bildrate ein, senkt das Spiel die
  Renderauflösung stufenweise und hebt sie wieder, sobald es ruhiger wird — schwache
  Handys bleiben spielbar, starke behalten volle Schärfe
- Nacht-Beleuchtung über einen Lichtpuffer mit einem Drittel Auflösung
  (spart ~90 % Füllrate, ohne sichtbaren Unterschied)
- Sämtliche Grafiken werden **prozedural** gezeichnet (kein einziges Bild-Asset) — mit Ziegel-,
  Holz- und Stein-Texturen, Schindeldächern, weichen Schatten und Glanzlichtern
- UI komplett mit **eigenen SVG-Icons** (keine Emojis)
- Sound: WebAudio-Synthesizer (Münzklirren mit steigender Tonhöhe!) + dezente generative Musik
- Responsive von Smartphone-Hochformat bis Ultrawide, Safe-Area-Unterstützung fürs iPhone
- Debug-Konsole: Spiel mit `?debug=1` öffnen → `KS.debug.gold(1000)`, `KS.debug.night()`, `KS.debug.buildAll(10)`, …

## 📂 Projektstruktur

```
index.html            Einstieg, HUD & SVG-Icon-Sammlung
css/style.css         UI-Design (Pergament & Gold)
js/config.js          Balance & Daten: Gebäude, Waffen, Monster, Bosse, Kapitel, Quests, Markt, Mauer
js/core.js            Utilities, Audio-Synth, Joystick, Speicher-I/O, Auto-Update-Erkennung
js/art.js             Prozedurale Grafik: alle Sprites, Boden, Requisiten
js/entities.js        Spieler, Monster-KI, Münzen, Projektile, Partikel
js/systems.js         Bauplatten & Einzahlung, Türme, Produktion, Mauer, Markt, Tag/Nacht, Quests
js/ui.js              HUD, Toasts, Banner, Story-Overlays, Menü, Markt-Panel
js/game.js            Game-Loop, Renderer, Kamera, Licht, Auto-Save, Auto-Qualität

deploy/install.sh             nginx-Site + HTTPS/Certbot + Härtung
deploy/install-autoupdate.sh  Auto-Update einrichten (systemd-Timer / Cron)
deploy/auto-update.sh         der eigentliche GitHub-Check (wird vom Timer gerufen)
deploy/update.sh              Update manuell einspielen
deploy/stamp-version.sh       Cache-Busting-Stempel + version.json
deploy/uninstall.sh           alles wieder entfernen
deploy/serve-lokal.sh         schneller lokaler Test ohne nginx
```

Viel Spaß beim Verteidigen, König! ⚔️
