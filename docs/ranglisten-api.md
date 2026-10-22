# Ranglisten – Schnittstelle für Spiele

Stand: Phase 4b. Die Plattform (Repo `bens-games-platform`, Claude) speichert Bestwerte und zeigt sie öffentlich auf
`bens-games.de/ranglisten/`. Die Spiele (eigene Repos, z. B. Codex) melden die Punkte und können Plätze anzeigen.
**Ohne Konto funktioniert das Spiel wie bisher** – Ranglisten gibt es nur für angemeldete Spieler.

## Grundlagen

Wie bei den Spielständen (`docs/spielstaende-api.md`): Aufrufe an `/api/...` auf derselben Adresse,
`credentials: 'same-origin'`; `POST` mit `Content-Type: application/json` und `X-CSRF-Token` aus `GET /api/account/me`.

Eine Rangliste heißt `board`: `[A-Za-z0-9_.-]`, max. 32 Zeichen. Reine Zahlen werden auf der Webseite als
„Level 3“ angezeigt, andere Namen mit großem Anfangsbuchstaben (z. B. `endlos` → „Endlos“).
Pro Rangliste zählt der **höchste** Wert (mehr Punkte = besser).

## Punkte melden

`POST /api/games/<id>/scores` mit `{ "board": "3", "score": 12500 }`

- nur angemeldet (sonst `401`), `score` ganze Zahl 0 … 1 000 000 000
- gespeichert wird nur ein **neuer Bestwert** (Woche und gesamt getrennt)
- Antwort `200`:
  ```json
  { "week": { "rank": 4, "score": 12500 }, "all": { "rank": 17, "score": 13800 }, "listed": true }
  ```
  `rank` ist `null`, wenn der Spieler nicht erscheint (Widerspruch, ausgeblendet). `listed: false` = Spieler hat
  Ranglisten für sich abgeschaltet – dann keine Plätze anzeigen.
- höchstens 300 Meldungen pro Stunde; Fehler nie ans Spiel durchreichen.

## Rangliste lesen (öffentlich)

`GET /api/games/<id>/leaderboard?board=3&period=week|all&page=1`

```json
{ "boards": ["1","2","3","endlos"], "board": "3", "period": "week", "week": "2026-W43",
  "entries": [ { "rank": 1, "display_name": "Lea", "score": 18000, "achieved_at": "2026-10-22 18:00:00", "me": false } ],
  "me": { "rank": 4, "score": 12500 } }
```

50 Einträge pro Seite. `me` nur mit Anmeldung.

## Empfehlungen

- **Nova Bastion:** `board` = Levelnummer (z. B. `"3"`), dazu `"endlos"` für den Endlos-Modus; `score` = Punkte des Levels.
  Nach dem Levelende melden und „Platz X diese Woche“ einblenden, Link „Alle Ranglisten“ → `/ranglisten/?spiel=nova-bastion`.
- **Royal Blocks:** `board` = Modus (z. B. `"klassisch"`), `score` = Endpunktzahl.
- Im Dev-/Testmodus des Spiels **keine** Punkte melden.
- Nur echte, im Spiel erreichte Werte melden. Unplausible Werte kann die Moderation in der Zentrale ausblenden.

## Links, Teilen und Ankündigungen

- **Direktlink auf eine Rangliste:** `/ranglisten/?spiel=<id>&liste=<board>` (z. B. `/ranglisten/?spiel=nova-bastion&liste=3`).
- **Spielerprofil:** `/spieler/?name=<Anzeigename>` (URL-kodiert). Zeigt Bestwerte mit Platz und Erfolge.
- **Teilen im Spiel:** `navigator.share({ title, text, url })`, ohne Teilen-Menü `navigator.clipboard.writeText(...)`.
  Als `url` den Direktlink auf die Rangliste verwenden. Keine Dienste Dritter (keine Share-Widgets).
- **Ankündigungen im Spiel (optional):** `GET /api/announcements?app=<id>` → `{ "announcements": [{ "id", "title", "body", "link", "level" }] }`
  (`level` = `info` | `success` | `warning`). Nur als Text anzeigen (`textContent`, nie `innerHTML`);
  `link` ist entweder ein Pfad dieser Webseite (`/…`) oder `https://…`. Weggeklickte IDs nur lokal merken.
- **Erfolge mit Namen (optional):** Das Spiel kann eine `achievements.json` im Build-Ordner mitliefern,
  z. B. `{ "stars30": { "name": "30 Sterne", "icon": "⭐" } }` (`icon` = ein Emoji). Die Datei muss in
  `lib/games.js` unter `files` stehen. Ohne Datei zeigt die Webseite die ID lesbar an (`stars30` → „Stars 30“).

## Datenschutz

Öffentlich sind Anzeigename, Punkte und Datum. Die Datenschutzerklärung der Plattform beschreibt das. Weitere Daten
(z. B. Spielverlauf, Wiederholungen) bitte nicht ohne Absprache mit Ben und dem Plattform-Chat senden.
