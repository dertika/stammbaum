# Stammbaum

Schlankes, rein lesendes Stammbaum-Dashboard für die Familie. Die Daten kommen aus
[Gramps Web](https://www.grampsweb.org/) über dessen REST-API. Die Zugangsdaten
bleiben im Backend, und an den Browser gehen nur ausdrücklich freigegebene Daten.

- Baumansicht mit Zoomen, Verschieben, Fokus auf eine Person und Generationensteuerung ([family-chart](https://github.com/donatso/family-chart))
- Präsentationsmodus für Beamer und Fernseher *(in Arbeit)*
- Teilen über geheime Links ohne Konto *(in Arbeit)*
- Admin-Bereich hinter Authelia (OIDC) *(in Arbeit)*

## Aufbau

| Verzeichnis | Inhalt |
|---|---|
| `backend/` | Node 22 + Fastify (TypeScript ohne Build-Schritt dank Type-Stripping) |
| `frontend/` | Svelte 5 + Vite (SPA) |
| `shared/` | Datentypen zwischen Backend und Browser |
| `deploy/` | Containerfile, Quadlet-Units, OpenResty-Konfiguration *(folgt)* |

## Entwicklung

```sh
npm install
npm run build          # Frontend nach frontend/dist bauen
npm run dev            # Backend (Port 8080, Musterdaten) + Vite-Dev-Server (Port 5173)
npm test               # Backend-Tests
npm run check          # Typprüfung
```

`npm run dev` verwendet die fiktive Musterfamilie aus `backend/fixtures/familie-muster.json`
(neu erzeugen mit `node backend/fixtures/generate.ts > backend/fixtures/familie-muster.json`)
und schaltet `DEV_OPEN_ACCESS=1` ein, sodass der Baum ohne Freigabelink abrufbar ist.
**In Produktion darf `DEV_OPEN_ACCESS` nie gesetzt sein.**

## Konfiguration

Jede Variable kann alternativ als Datei übergeben werden (`NAME_FILE=/run/secrets/…`).

| Variable | Standard | Bedeutung |
|---|---|---|
| `GRAMPS_API_URL` | – | Basis-URL von Gramps Web, möglichst intern (z. B. `http://host.containers.internal:5000`) |
| `GRAMPS_USER` | – | eigener Gramps-Web-Benutzer mit Rolle *Guest* (nur lesen, keine privaten Datensätze) |
| `GRAMPS_PASSWORD` | – | Passwort dieses Benutzers (Podman-Secret) |
| `CACHE_TTL` | `900` | Sekunden, bis die Daten im Hintergrund neu geladen werden |
| `ROOT_PERSON` | Gramps-Hauptperson | Gramps-ID der Startperson, z. B. `I0042` |
| `PORT` | `8080` | HTTP-Port im Container |
| `DATA_DIR` | `./data` | persistente Daten (Volume) |
