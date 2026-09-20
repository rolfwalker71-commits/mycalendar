# Kalender & Mail

Selbst gehostete App für Rolf und seine Frau: **Google-Kalender** und **Gmail** (Workspace) im Browser und als installierbare PWA. Kalender angelehnt an Apple Calendar, Mail an iOS Mail. Umschalter oben: Kalender | Mail.

Die App spricht **Deutsch** (`de-DE`). Standard-Zeitzone: **Europe/Berlin**. Die originalen Google-Event-Zeitzonen bleiben erhalten.

## Was v1 kann

- Google-Anmeldung (OAuth 2.0), getrennte Sitzungen pro Person
- Umschalter zwischen Kalender und Mail in derselben App
- Kalenderliste inklusive geteilter Kalender, Farben, Ein-/Ausblenden
- Ansichten: Tag, Woche, Monat, Jahr, Agenda
- Termine anlegen, bearbeiten, löschen (inkl. ganztägig über mehrere Tage)
- Wiederholung (täglich, Wochentags, wöchentlich, monatlich am Wochentag, jährlich)
- Einladungen und eigene Zusage (zusagen / vielleicht / ablehnen)
- Google Meet-Link anzeigen und optional beim Anlegen erzeugen
- Suche in Titel, Ort und Notiz (Cache)
- Mail: Posteingang, Markiert, Entwürfe, Gesendet, Spam, Papierkorb, eigene Label
- Lesen, antworten, senden, archivieren, löschen, markieren; Suche über Gmail
- Hell- und Dunkelmodus (oder „System“, folgt dem Gerät), installierbare PWA (iPhone, iPad, Desktop-Chrome, Android-Chrome)
- Oberfläche je Gerät: **Liquid Glass** auf iPhone/iPad, Material You 3 auf Android, Fluent 2 am PC (Auto, umschaltbar)
- Schriftgröße folgt der iOS-Textgröße (Einstellungen oder Kontrollzentrum › Textgröße), zusätzlich eigener Regler
- Web-Push für Termine und neue Mails (auch iPhone/iPad ab iOS 16.4)

## Was v1 nicht kann

Kein Chat, Kontakte, CalDAV, iCloud, Microsoft, Wear OS, native Widgets, Werbung oder Telemetrie. Räume, Arbeitsort, Fokus/OOO, Mail-Anhänge beim Senden, Geburtstags-Politur und Drag zwischen Kalendern sind für spätere Versionen vorgesehen.

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

## iPhone und iPad

1. Die App in **Safari** über HTTPS öffnen, dann Teilen › **Zum Home-Bildschirm**.
2. Die App **vom Home-Bildschirm** starten (nur dort gibt Apple Web-Push frei).
3. Einstellungen › Benachrichtigungen › **Push-Benachrichtigungen** einschalten und erlauben, danach „Testbenachrichtigung“.

Hinweise:

- Auf iPhone/iPad wählt „Auto“ automatisch **Liquid Glass**. Wer „Transparenz reduzieren“ oder „Kontrast erhöhen“ aktiviert hat, bekommt massive Flächen statt Glas.
- Die Schriftgröße folgt der **iOS-Textgröße**, auch live über das Kontrollzentrum (Steuerelement „Textgröße“, optional nur für diese App). Abschaltbar in den Einstellungen.
- Apple verlangt für Push ein gültiges VAPID-Subject (`mailto:` mit echter Adresse oder `https://`-URL). Die App nimmt die erste Adresse aus `ALLOWED_GOOGLE_EMAILS`, sonst `PUBLIC_BASE_URL`. Optional `VAPID_SUBJECT` setzen.

## Widgets mit Scriptable (iPhone und iPad)

Eigene Home- und Sperrbildschirm-Widgets über die kostenlose App [Scriptable](https://apps.apple.com/app/scriptable/id1405459188).

1. In der App: Einstellungen › **Widgets einrichten** (oder am Handy: Mehr › Widgets für Home-Bildschirm).
2. **Neues Widget**: Inhalt wählen (**Kalender**, **Mail** oder **Mein Tag**), Kalender anhaken, Kalendergrafiken ein/aus, Zeitraum. Beim Anlegen wird das Skript in die Zwischenablage kopiert.
3. In Scriptable **+** tippen, einfügen, benennen.
4. Home-Bildschirm lange drücken › **+** › Scriptable › Größe wählen › im Widget unter „Script“ das Skript wählen.

| Inhalt | Klein | Mittel | Groß | iPad extragroß | Sperrbildschirm |
|---|---|---|---|---|---|
| Kalender | Kalenderblatt mit Tageszahl oder Titelgrafik | heute mit Grafiken | Agenda 1/3/7 Tage | Agenda über zwei Spalten | rechteckig, rund, Textzeile |
| Mail | Ungelesene + neueste | 3 neueste | 6 neueste | 6 neueste | rund (Anzahl), rechteckig |
| Mein Tag | nächster Termin | Termine + Mail + Aufgabe | Termine, Mails, Aufgaben | Agenda links, Mails und Aufgaben rechts | wie Kalender |

- Die Einstellungen (Kalender, Grafiken, Zeitraum, Mail-Vorschau) liegen auf dem Server. Änderungen gelten ohne neues Einfügen des Skripts.
- Jedes Widget hat einen eigenen **Schlüssel, der nur lesen darf** (`/api/widget/data`). „Neuer Schlüssel“ oder Löschen sperrt ein kopiertes Skript sofort.
- „Absender und Betreff zeigen“ ausschalten, wenn auf dem Sperrbildschirm nur die Anzahl sichtbar sein soll.
- Das kleine Kalender-Widget gibt es als **Kalenderblatt** (Wochentag, große Tageszahl, nächster Termin) oder mit **Titelgrafik**; umschaltbar pro Widget.
- Optionaler Widget-Parameter in Scriptable: `kalender`, `mail` oder `tag` überschreibt den Inhalt.
- iOS aktualisiert Widgets selbst, meist alle 15–30 Minuten. Ohne Verbindung zeigt das Widget die letzten Daten mit „Offline · Stand …“.
- Die App muss vom Gerät aus erreichbar sein (HTTPS-Adresse, unter der die App geöffnet wurde).

## App-Icon

Das Icon entsteht aus einer Vektorquelle (`scripts/app-icon.mjs`); `npm run build:icons` schreibt alle PNG-Größen inklusive Apple-Touch- und maskable-Icons. Zweite Variante:

```bash
APP_ICON_VARIANT=fold npm run build:icons
```

Das Icon trägt bewusst **kein Datum**: iOS merkt sich das Icon beim Hinzufügen zum Home-Bildschirm und lädt es nie neu, nur native Apps dürfen ihr Icon wechseln. Die Tageszahl zeigen deshalb das Logo in der App, das Favicon im Browser-Tab und das Kalenderblatt-Widget.

## Illustrationen für Arbeitsplan-Termine

Termine aus einem Arbeitsplan-Kalender bekommen die allgemeine Kalendergrafik, genau wie andere Termine ohne eigenes Bild.

Zwei Ausnahmen, ohne jede Einrichtung:

- Hängt am Termin ein Bild (Google-Drive-Anhang), zeigt die App dieses Bild — in der Agenda und im Widget.
- Läuft die App direkt neben einer Schichtklar-Installation auf derselben Maschine (Entwicklung, gemeinsamer Ordner), nimmt sie deren Schicht-Illustrationen. Optional über `SCHICHTKLAR_DIR` steuerbar. Findet sie nichts, bleibt es bei der allgemeinen Grafik.

## Google Cloud OAuth

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein Projekt anlegen (oder das Workspace-Projekt nutzen).
2. **Google Calendar API** und **Gmail API** aktivieren.
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
- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.send`

Die App fordert `access_type=offline` und `prompt=consent` an, damit ein Refresh-Token gespeichert werden kann (AES-256-GCM, nie im Klartext).

Sensitive Calendar- und Gmail-Scopes sind für interne/Testing-Apps mit Testnutzern in Ordnung. Wer die App schon vor Mail genutzt hat, muss sich **einmal neu anmelden**, damit Gmail freigegeben wird.

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

Kalender und Mail nutzen denselben Google-Login und dieselbe Freigabeliste (`ALLOWED_GOOGLE_EMAILS`).

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
