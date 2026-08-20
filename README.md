# Kalender

Selbst gehostete Kalender-App für Rolf und seine Frau: Google-Kalender (Workspace) im Browser und als installierbare PWA. Optik angelehnt an den Apple-Kalender, Alltagstauglichkeit wie Samsung Calendar. Kein Material-Overload, keine Outlook-Tabellen.

Die App spricht **Deutsch** (`de-DE`). Standard-Zeitzone: **Europe/Berlin**. Die originalen Google-Event-Zeitzonen bleiben erhalten.

## Was v1 kann

- Google-Anmeldung (OAuth 2.0), getrennte Sitzungen pro Person
- Kalenderliste inklusive geteilter Kalender, Farben, Ein-/Ausblenden
- Ansichten: Tag, Woche, Monat, Jahr, Agenda
- Termine anlegen, bearbeiten, löschen (inkl. ganztägig über mehrere Tage)
- Wiederholung (täglich, Wochentags, wöchentlich, monatlich am Wochentag, jährlich)
- Einladungen und eigene Zusage (zusagen / vielleicht / ablehnen)
- Google Meet-Link anzeigen und optional beim Anlegen erzeugen
- Suche in Titel, Ort und Notiz (Cache)
- Hell- und Dunkelmodus, installierbare PWA (Desktop-Chrome und Android-Chrome)

## Was v1 nicht kann

Kein Mail, Chat, Kontakte, CalDAV, iCloud, Microsoft, Wear OS, native Widgets, Werbung oder Telemetrie. Räume, Arbeitsort, Fokus/OOO, Anhänge, Geburtstags-Politur, Push-Benachrichtigungen und Drag zwischen Kalendern sind für spätere Versionen vorgesehen.

Google-Kalender-Webhooks (`calendar.events.watch`) sind vorbereitet (`PUBLIC_BASE_URL`, Route `/api/google/push`), Standard bleibt Polling.

## Starten

```bash
cp .env.example .env
# JWT_SECRET, APP_ENCRYPTION_KEY, POSTGRES_PASSWORD setzen
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET eintragen (für Login)

docker compose up --build -d
```

Die App ist dann unter **http://localhost:3366** erreichbar (Host-Port über `APP_PORT`, Standard **3366**).

Die Datenbank veröffentlicht **keinen Host-Port**. PostgreSQL ist nur im internen Docker-Netz unter dem Hostnamen `db` erreichbar. Persistenz: Named Volume `postgres_data`.

Entwicklung ohne Docker:

```bash
npm install
npm run dev
```

API auf Port 3366, Vite-Devserver mit Proxy auf `/api`.

## Google Cloud OAuth

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen (oder das Workspace-Projekt nutzen).
2. **Google Calendar API** aktivieren.
3. OAuth-Zustimmungsbildschirm: Nutzertyp **intern** (Workspace) oder **extern / Testing** mit Testnutzern (Rolf und Frau).
4. OAuth-Client (Webanwendung) anlegen.

**Weiterleitungs-URIs**

- `http://localhost:3366/api/auth/google/callback`
- Produktions-HTTPS-URL, z. B. `https://kalender.example.com/api/auth/google/callback`

**Scopes**

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/calendar.calendars.readonly`

Die App fordert `access_type=offline` und `prompt=consent` an, damit ein Refresh-Token gespeichert werden kann (AES-256-GCM, nie im Klartext).

Sensitive Calendar-Scopes sind für interne/Testing-Apps mit Testnutzern in Ordnung.

## Zugang aus dem Internet

Die Kalender-Daten liegen erst nach Google-Login in der App. Zusätzlich **E-Mail-Freigabe** setzen, sonst könnte jedes Google-Konto ein Konto anlegen:

```
ALLOWED_GOOGLE_EMAILS=rolf@example.com,partner@example.com
```

In `production` ohne diese Liste ist der Login gesperrt.

Öffentlich nur hinter **HTTPS** betreiben (Caddy, nginx oder Cloudflare Tunnel). Dann:

1. In der Google-Cloud-Konsole die Produktions-Redirect-URI eintragen.
2. In `.env`: `NODE_ENV=production`, `COOKIE_SECURE=true`, `GOOGLE_REDIRECT_URI` und `PUBLIC_BASE_URL` auf `https://…` setzen.
3. PostgreSQL nicht nach außen mappen (Compose macht das bereits nicht).

Denselben Login und dieselbe Freigabeliste später für Mail (Gmail-API, gleiche Nutzer).

## Umgebungsvariablen

| Variable | Bedeutung |
| --- | --- |
| `NODE_ENV` | `development` oder `production` |
| `APP_PORT` | Host-Port, Standard `3366` |
| `JWT_SECRET` | Signatur der Session-Cookies |
| `JWT_EXPIRES_IN` | z. B. `7d` |
| `COOKIE_SECURE` | `true` hinter HTTPS, lokal `false` |
| `APP_ENCRYPTION_KEY` | AES-GCM für Refresh-Tokens; Fallback `JWT_SECRET` |
| `TZ` | Standard `Europe/Berlin` |
| `WEEK_START` | `1` Montag (Standard), `0` Sonntag |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Datenbank |
| `DATABASE_URL` | `postgres://…@db:5432/…` im Compose-Netz |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth |
| `GOOGLE_REDIRECT_URI` | muss zur Cloud-Konsole passen |
| `ALLOWED_GOOGLE_EMAILS` | Komma-getrennte Konten, die sich anmelden dürfen |
| `PUBLIC_BASE_URL` | optional, für Webhooks später |

Ohne gültige Google-Daten startet die App trotzdem: Login-Bildschirm und `GET /health` funktionieren.

## Image (GHCR)

```
ghcr.io/rolfwalker71-commits/mycalendar:latest
```

Workflow: `.github/workflows/publish-ghcr.yml` (Tags `latest`, `sha-…`, Branch). Siehe Kommentar dort zu `GHCR_TOKEN` vs. `GITHUB_TOKEN`.
