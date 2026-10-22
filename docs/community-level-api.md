# Community-Level und Online-Kampagne – Schnittstelle für Spiele

Stand: 23.10.2026. Ersetzt die Netlify-Funktionen `community` und `camp` von Nova Bastion auf bens-games.de.
Die Plattform (Repo `bens-games-platform`, Claude) stellt die API bereit; das Spiel bindet sie an.
Grundregeln wie in `spiele-anbindung.md` (nie blockieren, `textContent`, Service Worker cacht `/api/` nicht).

Zurzeit nur für `nova-bastion`. Andere Spiele bekommen `404 unknown_game`, bis die Plattform eine Prüfung für ihr
Level-Format hat (Auftrag über Ben an den Plattform-Chat).

## Was sich gegenüber Netlify ändert

| Bisher (Netlify) | Jetzt (bens-games.de) |
| --- | --- |
| Geräte-ID `pid` + `token` in `localStorage` | Konto. Hochladen, Daumen und Löschen nur angemeldet. |
| frei eingegebener Autorenname | Anzeigename des Kontos (kein `prompt` mehr nötig) |
| `ah` (Hash) zum Erkennen eigener Level | `mine: true/false` in der Liste |
| Löschen fremder Level mit Entwickler-PIN | nur in der Zentrale (Moderation) |
| Kampagne mit Entwickler-PIN aus dem Editor speichern | Kampagne in der Zentrale hochladen (Recht `app.nova-bastion.manage`) |

Den Entwickler-PIN (`novabastion.pin`) braucht das Spiel auf der Plattform nicht mehr. Kein Admin-Vorgang darf aus dem Spiel heraus möglich sein.

## Endpunkte

Alle unter `/api/games/nova-bastion/…`, `credentials: 'same-origin'`. POST wie in `spielstaende-api.md`
(`Content-Type: application/json`; angemeldete Aufrufe zusätzlich `X-CSRF-Token` aus `GET /api/account/me`).

### `GET levels` – Liste (öffentlich)
`{ "levels": [ { "id": 12, "name", "author", "mine", "liked", "star", "boss", "style", "np", "focus", "thumb",
"likes", "plays", "wins", "best": [{ "n": "Anna", "l": 12 }], "t": 1729500000000 } ] }` – neueste zuerst, höchstens 500.
`id` ist jetzt eine **Zahl**. `mine`/`liked` nur mit Anmeldung wahr.

### `GET levels/get?id=<id>` – ein Level (öffentlich)
`{ "meta": { …wie oben… }, "level": { …bereinigtes Level… } }`, `404` wenn unbekannt oder ausgeblendet.

### `POST levels/upload` – hochladen (Anmeldung + CSRF)
Body `{ "level": {…}, "star": 1–5, "boss": bool, "style": "moon|ice|lava|station|crystal" }` → `{ "ok": true, "id": 12 }`.
Fehler: `401` nicht angemeldet, `413 too_big` (> 60 KB), `422 bad_level`, `429 wait` (1 Minute Abstand),
`429 limit` (15 Level pro Konto), `429 full` (500 Level im Spiel). Das Level wird wie bisher bereinigt
(`api/src/NovaBastionLevel.php`, übertragen aus `community.mjs`).

### `POST levels/like` – Daumen hoch an/aus (Anmeldung + CSRF)
Body `{ "id": 12 }` → `{ "ok": true, "likes": 3, "liked": true }`. Eigene Level: `422 own_level`.

### `POST levels/result` – gespielt/geschafft (ohne Anmeldung möglich, kein CSRF nötig)
Body `{ "id": 12, "win": true, "lives": 7 }` → `{ "ok": true }`. Zählt „gespielt“ und „geschafft“; mit Konto und Sieg
zusätzlich die Bestenliste (bester Wert je Konto). Den Namen schickt das Spiel nicht mehr.

### `POST levels/delete` – eigenes Level löschen (Anmeldung + CSRF)
Body `{ "id": 12 }` → `{ "ok": true }`, `404` wenn es nicht dein Level ist.

### `GET campaign` – Online-Kampagne (öffentlich)
`{ "ts": 1729500000000, "json": "<Kampagne als JSON-Text>" }` oder `{ "ts": 0, "json": null }`. Gleiche Form wie bisher
bei Netlify: Laden, wenn `ts` neuer ist als die eingebaute Kampagne.

## Kampagne veröffentlichen (für Ben)

1. Im Level-Editor des Spiels die Kampagne als Datei exportieren (`.json`, der Inhalt, der bisher an `camp` ging).
2. Zentrale → **Apps** → Nova Bastion → **Kampagne** → Datei auswählen → **Kampagne veröffentlichen**.
3. Spieler bekommen sie beim nächsten Start des Spiels.

## Kristalle für Daumen

Wie bisher im Spiel: aus der Liste die eigenen Level (`mine`) und ihre `likes` mit dem gemerkten Stand vergleichen.
Merken nun je Level-`id` (Zahl).

## Alte Level von Netlify

Die bisher auf Netlify hochgeladenen Level werden nicht automatisch übernommen (sie haben keine Konten).
