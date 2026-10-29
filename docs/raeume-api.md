# Räume – Mehrspieler-Schnittstelle für Spiele

Stand: 29.10.2026 (Migration 016, `api/src/Rooms.php`). Umsetzung des Entwurfs aus `AUFTRAG-MULTIPLAYER.md`, Abschnitt C.
Erstes Spiel damit: **Drei Fronten** (`drei-fronten/src/online.js`, `createApiTransport`).

## Grundidee

Der Server ist ein neutraler „Schiedsrichter-Briefkasten“. Er verwaltet Räume, Plätze und eine **geordnete Liste von
Aktionen**. Die Spielregeln laufen in allen Spielern gleich (deterministisch): Jeder Client wendet dieselben Aktionen in
derselben Reihenfolge an und kommt zum selben Spielstand. Ungültige Aktionen ignorieren alle Clients gleich. Zufall nur
aus dem `seed`, den der Server beim Start vergibt. Neu Beitretende rechnen den Stand aus allen Aktionen nach.

Die Webseite hat **keine WebSockets** – es wird abgefragt (Polling): Lobby alle 3 s, Partie alle 1 s.

## Aufrufe

Alle unter `/api/games/<spiel-id>/rooms/…`, JSON, `credentials: 'same-origin'`.
Nach `create`/`join`/`quick` bekommt der Platz ein **`token`** – bei allen weiteren Aufrufen als Kopfzeile
**`X-Room-Token`** mitschicken (pro Tab in `sessionStorage`, nie in `localStorage`).
Gäste spielen ohne Konto und heißen automatisch „Gast 1234“. **Angemeldete** werden ihrem Konto zugeordnet (Anzeigename,
Profilbild) und schicken bei allen `POST` zusätzlich `X-CSRF-Token` aus `GET /api/account/me` – sonst `403 csrf`.

| Aufruf | Zweck |
|---|---|
| `POST rooms/create` `{ max_players: 2–8, visibility: "private"\|"public", mode: "<a-z0-9_- ≤24>", settings: {…≤2 KB} }` | Raum erstellen → `{ room, you: { seat, token } }` |
| `POST rooms/join` `{ code: "ABC123" }` | Per Code beitreten. Ein Konto, das schon im Raum ist, bekommt seinen Platz mit neuem Token zurück (auch in laufender Partie) |
| `POST rooms/quick` `{ mode, max_players }` | Freien öffentlichen Raum mit gleichem `mode` und `max_players` finden oder neu anlegen |
| `GET rooms/poll?code=ABC123&after=<seq>` | Raum + Aktionen nach `seq` (höchstens 200, dann gleich nochmal) |
| `POST rooms/ready` `{ ready: true/false }` | In der Lobby bereit melden |
| `POST rooms/start` | Nur Gastgeber, ab 2 Spielern → `status: "playing"`, Server setzt `seed` |
| `POST rooms/action` `{ data: {…≤4 KB} }` | Aktion anhängen → `{ seq }`. Geprüft werden nur Platz, Größe und Tempo (≈ 10/s) |
| `POST rooms/finish` `{ results: [{ seat, place, score }] }` | Nur Gastgeber: Partie beenden |
| `POST rooms/leave` | Platz verlassen (Lobby: frei; Partie: „verlassen“). Gastgeber-Rolle wandert weiter, leerer Raum wird gelöscht |
| `POST rooms/kick` `{ seat }` | Gastgeber entfernt jemanden – nur in der Lobby |

`ready`, `start`, `action`, `finish`, `leave` und `kick` brauchen keinen Code – das Token bestimmt den Raum.

Antwort von `poll` (und `room` bei den anderen):

```json
{
  "room": {
    "code": "ABC123", "status": "waiting|playing|finished", "mode": "duell", "visibility": "private",
    "max_players": 2, "host_seat": 0, "seed": 123456789, "settings": {},
    "players": [ { "seat": 0, "name": "Anna", "avatar_url": "/avatars/fox-amber.svg", "account": true,
                   "online": true, "ready": false, "left": false } ]
  },
  "actions": [ { "seq": 1, "seat": 0, "data": { "type": "plan" }, "at": "2026-10-29T18:00:01Z" } ],
  "last_seq": 1
}
```

- `seed` erst ab `playing`. `online` = in den letzten 15 s abgefragt.
- Codes bestehen aus `A–Z` ohne I/O und `2–9`.

## Fehler

`404 room_not_found` (auch abgelaufen), `404 unknown_game`, `409 room_full` / `already_started` / `not_enough_players` /
`not_playing` / `too_many_actions`, `403 not_in_room` / `not_host` / `csrf`, `413 too_large`, `422 validation`,
`429 too_many_attempts` (z. B. mehr als 60 Beitritts-Versuche pro Stunde – bremst das Raten von Codes).

## Aufräumen

Lobby nach 30 Minuten ohne Aktivität, Partie nach 2 Stunden ohne Aktivität, alles spätestens 24 Stunden nach dem
Erstellen gelöscht (beim Zugriff und in der täglichen Aufräumrunde). Höchstens 5000 Aktionen pro Partie.
Ranglisten laufen weiter über `POST /api/games/<id>/scores` je angemeldetem Spieler.

## Datenschutz

Gespeichert werden Raum-Code, Status, Modus, `seed`, Einstellungen, die Plätze (Hash des Tokens, Konto oder Gastname,
bereit, zuletzt gesehen, verlassen, Platz und Punkte am Ende) und die Aktionen – **keine IP-Adressen**, keine freien Texte.
Mitspieler im selben Raum sehen Anzeigename und Profilbild. Die Datenschutzerklärung beschreibt das (Abschnitt
„Mehrspieler-Räume“). Neue Datenarten nur nach Absprache.
