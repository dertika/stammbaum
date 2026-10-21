# Stammbaum

Schlankes, rein lesendes Stammbaum-Dashboard für die Familie unter
**https://stammbaum.dertika.de**. Die Daten kommen aus Gramps Web
(**https://stammbaum-admin.dertika.de**) über dessen REST-API. Die Zugangsdaten
bleiben im Backend, und an den Browser gehen nur ausdrücklich freigegebene Daten.

- **Baumansicht:** Zoomen, Verschieben, Fokus per Klick, Personensuche,
  Generationen vor und zurück, Profilbilder, Detail-Panel. Mobil wird es zum Bottom-Sheet.
- **Präsentationsmodus:** Vollbild für Beamer und Fernseher mit großer Schrift und
  hohem Kontrast. Steuerung per Pfeiltasten und Presenter-Fernbedienung. Es gibt
  einen freien Modus und Präsentationen mit festen Stationen wie Folien.
- **Teilen per Link:** geheime Links mit 256-Bit-Token, nur zum Ansehen. Pro Link
  einstellbar: Bezeichnung, Ablaufdatum, Widerruf, lebende Personen sichtbar oder
  anonymisiert, freigegebene Präsentationen. Die Filterung passiert ausschließlich
  serverseitig.
- **Admin-Bereich** (`/admin`, OIDC über Authelia): Links verwalten, angezeigte
  Personendetails festlegen, Präsentationen zusammenstellen, Daten neu laden,
  Button „Stammbaum bearbeiten“.

## Architektur

```
Browser ──https──▶ OpenResty (CrowdSec, *.dertika.de) ──▶ 127.0.0.1:8090
                                                         stammbaum-Container (Node 22, Fastify)
                                                         ├─ SPA (Svelte 5 + family-chart)
                                                         ├─ /s/<token>, /api/view/*   Familie
                                                         ├─ /auth/*, /api/admin/*      Admin (OIDC)
                                                         └─ /data: SQLite + Bild-Cache (Volume)
                                                                │ intern, JWT
                                                                ▼
                                                         Gramps Web API
```

### So schützt das Backend die Daten

1. Das Backend meldet sich mit einem eigenen Gramps-Benutzer an (Rolle **Guest**).
   Damit liefert Gramps als privat markierte Datensätze gar nicht erst aus. Was
   trotzdem als privat markiert ankommt, verwirft das Backend.
2. Der Stammbaum liegt als Snapshot im Speicher und wird nach `CACHE_TTL`
   Sekunden im Hintergrund neu geladen.
3. Für jede Anfrage entsteht aus Snapshot, Link-Einstellungen und
   Detail-Einstellungen ein eigenes, reduziertes JSON. Rohe Gramps-Objekte
   verlassen das Backend nie.
   - **Lebende Personen** werden bei „anonymisieren“ zu „Lebende Person“: kein Name,
     keine Daten, kein Bild, keine Details. Nur ihre Position im Baum bleibt erhalten.
     Familienereignisse wie eine Hochzeit mit einem lebenden Partner entfallen ebenfalls.
   - Als lebend gilt, wer weder ein Todes- noch ein Begräbnisereignis hat und nicht
     nachweislich älter als `LIVING_YEARS` ist. Fehlende Geburtsjahre werden vorsichtig
     über die Kinder abgeschätzt. Im Zweifel gilt eine Person als lebend.
   - Abgeschaltete Kategorien (Foto, Lebensdaten, Ereignisse, Orte, Notizen) fehlen
     komplett im JSON.
   - Bilder liefert das Backend nur aus, wenn sie zu einer für diesen Link sichtbaren
     Person gehören. Es nutzt dafür immer die verkleinerten Thumbnails von Gramps Web,
     nie die Originale. Aktuelle Gramps-Web-Versionen liefern diese als AVIF; das
     Backend wandelt sie einmalig in JPEG um, damit sie auch auf älteren Geräten
     (z. B. iPad vor iOS 16) erscheinen, und entfernt dabei alle Metadaten.
     Fehler beim Laden zeigt der Admin-Bereich unter *Datenstand* an.
4. `/s/<token>` setzt ein HttpOnly-Cookie und leitet ohne Token in der URL weiter.
   Ablauf und Widerruf werden bei jeder Anfrage geprüft.
5. In der Datenbank liegt nur der SHA-256-Hash des Tokens zum Nachschlagen. Damit
   der Admin-Bereich den Link erneut anzeigen kann, liegt das Token zusätzlich
   AES-256-GCM-verschlüsselt vor. Den Schlüssel leitet das Backend aus `APP_SECRET` ab.

### Warum family-chart?

[family-chart](https://github.com/donatso/family-chart) (MIT, D3) bringt das
gewünschte Interaktionsmodell schon mit:
- Zoomen und Verschieben.
- Klick fokussiert eine Person, mit animiertem Übergang.
- Vorfahren- und Nachkommentiefe lassen sich getrennt einstellen.
- Die HTML-Karten lassen sich frei gestalten, das ermöglicht etwa die großen Karten
  im Präsentationsmodus.

[topola](https://github.com/PeWu/topola) ist stärker bei statischen Gesamtdiagrammen
für Druck und Poster. Fokuswechsel und Animationen müsste man dort selbst bauen.

## Einrichtung auf srv-linux (rootless Podman, Benutzer `christian`)

### 1. Gramps-Web-Benutzer anlegen

Lege in Gramps Web unter *Einstellungen → Benutzerverwaltung* einen eigenen Benutzer
an, z. B. `stammbaum-dashboard`, mit der Rolle **Guest** (nur lesen, keine privaten
Datensätze).

### 2. OIDC-Client in Authelia

Den Ausschnitt aus [`deploy/authelia/oidc-client.yml`](deploy/authelia/oidc-client.yml)
in die Authelia-Konfiguration übernehmen und Authelia neu starten. Den
Klartext des Client-Secrets brauchst du im nächsten Schritt. Nur Mitglieder der
Gruppe `stammbaum-admins` dürfen in den Admin-Bereich (`OIDC_ADMIN_GROUP`).

### 3. Image

Die GitHub-Action [`ci.yml`](.github/workflows/ci.yml) baut nach erfolgreichen Tests
ein Image für `linux/amd64` und `linux/arm64` und legt es als Paket in der GitHub
Container Registry ab:

| Auslöser | Tags |
|---|---|
| Push auf den Standard-Branch | `latest`, `sha-<commit>` |
| Git-Tag `v1.2.3` | `1.2.3`, `1.2`, `1`, `sha-<commit>` |
| manuell (*Actions → CI → Run workflow*) | wie oben, je nach Branch |

```sh
podman pull ghcr.io/dertika/stammbaum:latest
```

Ist das Paket privat, gibt es zwei Wege: unter *GitHub → Packages → stammbaum →
Package settings* auf *Public* stellen, oder einmalig
`podman login ghcr.io -u dertika` mit einem Token mit `read:packages` ausführen.
Die Anmeldung landet in `${XDG_RUNTIME_DIR}/containers/auth.json`. Damit sie einen
Neustart übersteht, mit `--authfile ~/.config/containers/auth.json` speichern.

Eine neue Version veröffentlichst du so:

```sh
git tag v1.0.0 && git push origin v1.0.0
```

Selbst bauen geht auch: `podman build -t localhost/stammbaum:latest -f Containerfile .`.
Dann in der Quadlet-Datei `Image=localhost/stammbaum:latest` und `AutoUpdate=local` setzen.

### 4. Secrets anlegen

```sh
printf '%s' 'PASSWORT-DES-GRAMPS-BENUTZERS' | podman secret create stammbaum_gramps_password -
printf '%s' 'KLARTEXT-DES-OIDC-CLIENT-SECRETS' | podman secret create stammbaum_oidc_client_secret -
openssl rand -base64 48 | tr -d '\n' | podman secret create stammbaum_app_secret -
```

> `stammbaum_app_secret` verschlüsselt die gespeicherten Link-Tokens und signiert die
> Admin-Sitzungen. Wird es geändert, funktionieren bestehende Links nicht mehr.

### 5. Quadlet-Units

```sh
mkdir -p ~/.config/containers/systemd
cp deploy/quadlet/stammbaum.container deploy/quadlet/stammbaum-data.volume ~/.config/containers/systemd/
# GRAMPS_API_URL (Port von Gramps Web) und OIDC_ISSUER prüfen bzw. anpassen
systemctl --user daemon-reload
systemctl --user start stammbaum
systemctl --user status stammbaum
loginctl enable-linger christian   # falls noch nicht geschehen
```

**Gramps Web intern erreichen:** `host.containers.internal` zeigt in rootless
Podman 5 (pasta) auf den Host. Das funktioniert, wenn Gramps Web auf dem Host
veröffentlicht ist, z. B. `PublishPort=127.0.0.1:5000:5000`. Alternativ hängst du
beide Container in ein gemeinsames Podman-Netz (`Network=…`) und nutzt
`http://<gramps-container>:5000`.

**Automatische Updates:** `AutoUpdate=registry` in der Quadlet-Datei plus Timer:

```sh
systemctl --user enable --now podman-auto-update.timer   # täglich
podman auto-update --dry-run                              # prüfen, was anstünde
```

Schlägt der Start eines neuen Images fehl, rollt Podman automatisch auf das vorige zurück.
Wer Updates lieber selbst steuert, trägt einen festen Tag ein (z. B. `:1.0.0`) und
ändert ihn bei Bedarf.

### 6. OpenResty

[`deploy/openresty/stammbaum.dertika.de.conf`](deploy/openresty/stammbaum.dertika.de.conf)
ins OpenResty-`conf.d` kopieren. Die Zertifikatspfade passt du an dein
Wildcard-Zertifikat an. Der CrowdSec-Bouncer muss im `http`-Kontext initialisiert sein
(`crowdsec_openresty.conf` des offiziellen Bouncers). Danach `openresty -t && openresty -s reload`.

Der Block enthält:
- HTTP/2 und Weiterleitung von HTTP auf HTTPS.
- HSTS und eine strikte Content-Security-Policy.
- Ratenbegrenzung auf `/s/` und `/auth/`.
- Kein Access-Log für Link-Aufrufe, damit keine Tokens im Log landen.

### 7. Erster Aufruf

1. https://stammbaum.dertika.de/admin aufrufen und über Authelia anmelden.
2. Unter **Datenstand** prüfen, ob die Personen geladen wurden.
3. Unter **Freigabelinks** einen Link anlegen. Er wird beim Anlegen sofort kopiert.

## Konfiguration

Jede Variable kann alternativ als Datei übergeben werden (`NAME_FILE=/run/secrets/…`).

| Variable | Standard | Bedeutung |
|---|---|---|
| `PUBLIC_URL` | `http://localhost:8080` | öffentliche Adresse, Basis für Links und OIDC-Callback |
| `APP_SECRET` | – | mindestens 32 Zeichen; verschlüsselt Link-Tokens, signiert Sitzungen |
| `GRAMPS_API_URL` | – | Basis-URL von Gramps Web, möglichst intern |
| `GRAMPS_USER` / `GRAMPS_PASSWORD` | – | Gramps-Benutzer mit Rolle *Guest* |
| `GRAMPS_EDIT_URL` | `https://stammbaum-admin.dertika.de` | Ziel des Buttons „Stammbaum bearbeiten“ |
| `OIDC_ISSUER` | – | z. B. `https://auth.dertika.de`; ohne OIDC ist `/admin` gesperrt |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | – | OIDC-Client aus Authelia |
| `OIDC_ADMIN_GROUP` | – | optional: nur diese Gruppe darf in den Admin-Bereich |
| `CACHE_TTL` | `900` | Sekunden, bis die Daten im Hintergrund neu geladen werden |
| `LIVING_YEARS` | `100` | ohne Todesangabe gilt als lebend, wer jünger ist |
| `ROOT_PERSON` | Gramps-Hauptperson | Gramps-ID einer Startperson, z. B. `I0042` – nur Fallback, wenn im Admin keine gesetzt ist |
| `PORT` / `DATA_DIR` | `8080` / `/data` | HTTP-Port und Datenverzeichnis im Container |

## Startansicht

Welche Person beim Öffnen im Mittelpunkt steht, entscheidet die erste passende Angabe:

1. Person aus der URL (`#/p/<id>`), z. B. aus einem Lesezeichen
2. Startperson des Freigabelinks (Admin → Freigabelinks → Bearbeiten)
3. globale Startperson (Admin → Anzeige → Startansicht)
4. `ROOT_PERSON`
5. Hauptperson aus Gramps (*Startperson festlegen* in Gramps)

Wird die Startperson für einen Link als lebend anonymisiert, beginnt die Ansicht beim
nächsten sichtbaren Vorfahren. Die Standard-Tiefe (Vorgabe: 3 Generationen Vorfahren
und Nachkommen) lässt sich ebenfalls unter *Anzeige* einstellen. Was Besucher mit +/−
ändern, merkt sich ihr Browser; „Standard“ setzt es zurück.

## Bedienung im Präsentationsmodus

| Taste | Folien | Freier Modus |
|---|---|---|
| `→` `Bild ↓` `Leertaste` | weiter | `→` Geschwister/Partner rechts |
| `←` `Bild ↑` | zurück | `←` Geschwister/Partner links |
| `↑` / `↓` | zurück / weiter | Eltern / Kinder |
| `Pos1` / `Ende` | erste / letzte Folie | – |
| `B` oder `.` | Schwarzbild | Schwarzbild |
| `F` | Vollbild | Vollbild |
| `Esc` | Vollbild verlassen, dann beenden | ebenso |
| `?` | Hilfe | Hilfe |

Die meisten Presenter-Fernbedienungen senden `Bild ↑`/`Bild ↓`, das funktioniert ohne
Einrichtung. Die aktuelle Folie steht in der URL (`#/praesentation/<id>/<nr>`) und
übersteht ein Neuladen.

## Entwicklung

```sh
npm install
npm run build          # Frontend nach frontend/dist bauen
npm run dev            # Backend (Port 8080, Musterdaten) + Vite-Dev-Server (Port 5173)
npm test               # Backend-Tests (Vitest)
npm run check          # Typprüfung Backend und Frontend
```

`npm run dev` verwendet die fiktive Musterfamilie aus `backend/fixtures/familie-muster.json`
(neu erzeugen mit `node backend/fixtures/generate.ts > backend/fixtures/familie-muster.json`).
Außerdem setzt es `DEV_OPEN_ACCESS=1` (Baum ohne Link) und `ADMIN_DEV_LOGIN=1`
(Admin ohne OIDC). **Beides darf in Produktion nie gesetzt sein.**

| Verzeichnis | Inhalt |
|---|---|
| `backend/` | Node 22 + Fastify; TypeScript läuft direkt per Type-Stripping |
| `frontend/` | Svelte 5 + Vite; Familienansicht und Admin als getrennte Bundles |
| `shared/` | Datentypen zwischen Backend und Browser |
| `deploy/` | Quadlet-Units, OpenResty-Server-Block, Authelia-Client |
