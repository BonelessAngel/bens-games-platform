# Spielstände und Erfolge im Konto – Schnittstelle für Spiele

Stand: Phase 4a. Gilt für alle Spiele unter `bens-games.de/games/<id>/`, zuerst Nova Bastion (`nova-bastion`).
Die Plattform (Repo `bens-games-platform`, Claude) stellt die API bereit; das Spiel (eigenes Repo, z. B. Codex)
bindet sie an. Das Spiel muss **ohne Konto weiter vollständig funktionieren** – das Konto ist nur eine Zusatz-Sicherung.

## Grundlagen

- Alle Aufrufe gehen an dieselbe Adresse wie das Spiel: `/api/...` (absoluter Pfad, nicht relativ).
- Angemeldet ist man über das Cookie `__Host-bg_session`, das der Browser automatisch mitschickt
  (`fetch(..., { credentials: 'same-origin' })`). Das Spiel liest oder setzt nie selbst Cookies.
- Jede `POST`-Anfrage braucht:
  - `Content-Type: application/json`
  - den Header `X-CSRF-Token` mit dem Wert `csrf` aus `GET /api/account/me`
  - (den `Origin`-Header setzt der Browser selbst)
- Keine Anmeldedaten, Tokens oder E-Mail-Adressen im `localStorage` speichern.
- Zeitstempel `t` = Millisekunden wie `Date.now()` (Nova Bastion: `SAVE.t`).

## Endpunkte

### `GET /api/account/me`
Prüft, ob jemand angemeldet ist.

- `200` → `{ "user": { "id", "display_name", "email", "two_factor", … }, "csrf": "…" }`
- `401` → nicht angemeldet (Spiel läuft lokal weiter)
- `503` → Konten gerade nicht verfügbar (wie nicht angemeldet behandeln)

### `GET /api/games/<id>/save`
- `200` → `{ "save": { "data": "<JSON-Text>", "t": 1729500000000, "updated_at": "2026-10-21 10:00:00" } | null, "achievements": ["stars30", …] }`
- `401` nicht angemeldet, `404` unbekanntes Spiel

### `POST /api/games/<id>/save/put`
Body: `{ "data": "<JSON-Text des Spielstands>", "t": <Zahl>, "achievements": ["id1", "id2"] }`

- `data`: der komplette Spielstand als Text (z. B. `JSON.stringify(SAVE)`), höchstens 512 KB
- `t`: Zeitstempel des Spielstands; **der neuere gewinnt**
- `achievements` (optional): IDs aller freigeschalteten Erfolge (`[A-Za-z0-9_.-]`, max. 64 Zeichen).
  Erfolge werden nur ergänzt, nie entfernt. Bei Nova Bastion nur die Erfolge des normalen Profils (`SAVE.camp.ach`),
  **nicht** die des Dev-Profils.

Antworten:
- `200` → `{ "status": "saved", "t": …, "achievements_added": <Anzahl> }`
- `409` → `{ "error": "newer_save", "save": { "data", "t", "updated_at" } }` – im Konto liegt ein neuerer Stand
  (z. B. von einem anderen Gerät). Das Spiel soll ihn übernehmen (Nova Bastion: `applyRemote(JSON.parse(save.data))`).
- `401` nicht angemeldet · `403` CSRF-Token fehlt/falsch · `413` zu groß · `422` ungültig · `429` zu oft (max. 240 pro Stunde)

### `POST /api/games/<id>/save/delete`
Löscht Spielstand und Erfolge dieses Spiels im Konto (wird auch unter „Mein Konto“ angeboten).

## Empfohlener Ablauf im Spiel

1. **Start:** `GET /api/account/me`.
   - Nicht angemeldet → wie bisher nur lokal. Optional Hinweis/Link
     „Mit Konto sichern“ → `/konto/anmelden/?zurueck=/games/<id>/` (nach der Anmeldung geht es zurück ins Spiel).
2. **Angemeldet:** `GET /api/games/<id>/save`.
   - Kein Stand im Konto → lokalen Stand hochladen (`put`).
   - Stand im Konto, lokal noch nichts gespielt → Konto-Stand übernehmen.
   - **Beide vorhanden und verschieden (erstes Anmelden auf diesem Gerät):** Spieler fragen, welcher Stand bleiben soll,
     z. B. „Dieses Gerät: 34 Sterne, gestern“ / „Konto: 41 Sterne, heute“. Den gewählten mit `t = Date.now()`
     hochladen, damit er gewinnt. Nicht stillschweigend überschreiben.
3. **Während des Spielens:** nach dem lokalen Speichern (Nova Bastion: `persist()`) gebündelt hochladen,
   z. B. höchstens alle 5 Sekunden und beim Verlassen der Seite (`visibilitychange` → `hidden`).
   Bei `409` den Konto-Stand übernehmen.
4. **Fehler/offline:** einfach lokal weiterspielen und später erneut versuchen. Fehler nie als Spielabbruch behandeln.

## Datenschutz

Gespeichert werden nur der Spielstand-Text, sein Zeitstempel, Größe, Speicherzeit und die Erfolgs-IDs –
ohne IP-Adresse. Beim Löschen des Kontos wird alles mit gelöscht. Die Datenschutzerklärung der Plattform beschreibt das.
Wenn ein Spiel weitere Daten an die Plattform schicken soll (z. B. Statistik-Ereignisse), muss vorher die
Datenschutzerklärung erweitert werden – bitte nicht ohne Absprache.
