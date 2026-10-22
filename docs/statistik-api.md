# Spielstatistik – Schnittstelle für Spiele

Stand: Phase 5b. Die Plattform (Repo `bens-games-platform`, Claude) wertet die Ereignisse in der Zentrale aus
(Bereich „Spiele“: Spielzeit, Besuche pro Tag, Level mit Gewinn-/Abbruchquote, schwerste Level, Punkte, Zusatzwerte).
Die Spiele (eigene Repos, z. B. Codex) schicken die Ereignisse. **Das Spiel muss ohne diese Statistik genauso funktionieren.**

## Endpunkt

`POST /api/events` – gleiche Adresse wie das Spiel (absoluter Pfad), `Content-Type: application/json`,
`credentials: 'same-origin'`. **Kein CSRF-Token nötig.** Ist der Spieler angemeldet, ordnet der Server die Ereignisse
seinem Konto zu (außer er hat widersprochen); sonst anonym. Das Spiel schickt selbst **nie** Namen, E-Mails oder Konto-IDs.

```json
{
  "app": "nova-bastion",
  "visit": "3f9c0e…(16–32 Hex-Zeichen)",
  "events": [
    { "type": "level_end", "level": "3", "result": "lose", "score": 1200, "stars": 0, "seconds": 245,
      "data": { "tower_laser": 4, "tower_frost": 2, "hero": "vega" } }
  ]
}
```

- `visit`: **pro Seitenaufruf neu** zufällig erzeugen (z. B. `crypto.getRandomValues`, 16 Bytes als Hex) und **nur im Speicher**
  halten – nicht in `localStorage`, Cookies o. Ä. speichern.
- Höchstens 50 Ereignisse pro Anfrage. Antwort `202 {stored}`; Fehler einfach ignorieren (nie das Spiel stören).

## Ereignis-Typen

| type | Pflichtfelder | optional | Bedeutung |
|---|---|---|---|
| `start` | – | – | Spiel geöffnet |
| `heartbeat` | `seconds` | – | aktive Spielzeit seit dem letzten Signal (max. 600). Nur zählen, solange die Seite sichtbar ist |
| `level_start` | `level` | – | Level begonnen |
| `level_end` | `level`, `result` | `score`, `stars`, `seconds`, `data` | Level beendet: `win`, `lose` oder `abort` (aufgegeben/verlassen) |

Erlaubte Werte (alles andere wird verworfen):
- `level`: `[A-Za-z0-9_.-]`, max. 32 Zeichen (z. B. `"3"`, `"endlos"`, `"w2-5"`)
- `score` ≥ 0, `stars` 0–10, `seconds` ≥ 0 (ganze Zahlen)
- `data`: max. 12 Einträge, Schlüssel `[a-z0-9_]` (max. 32), Werte **ganze Zahlen ≥ 0** (werden summiert, z. B. `tower_laser: 4`)
  oder **kurze Kennungen** `[a-z0-9_-]` (werden gezählt, z. B. `hero: "vega"`). **Keine Freitexte, keine Namen.**

## Empfohlener Ablauf

1. Beim Start: `visit` erzeugen, `start` vormerken.
2. Ereignisse in einer kleinen Warteschlange sammeln und gebündelt senden: alle 60 Sekunden ein `heartbeat` mit den aktiven
   Sekunden (nur bei sichtbarer Seite) plus alles Gesammelte; zusätzlich bei `visibilitychange` → `hidden` sofort senden
   (`keepalive: true`, Anfrage klein halten).
3. Levelende immer melden, auch Aufgeben/Verlassen als `abort`.
4. Respektiere `navigator.globalPrivacyControl === true`: dann keine Ereignisse senden.
5. Im Dev-/Testmodus des Spiels keine Ereignisse senden.

## Spielbezogene Vorschläge

- **Nova Bastion:** `level` = Levelnummer bzw. `endlos`/`heroic-<n>`; `score`, `stars`, `seconds`; `data` z. B. gebaute Türme
  pro Typ (`tower_<typ>`: Anzahl), Held (`hero`), durchgebrochene Gegner (`leaks`).
- **Royal Blocks:** `level` = Modus/Stufe; `score`; `data` z. B. Pokerhände (`hand_flush`: Anzahl), Reihen (`lines`).

## Datenschutz

Die Datenschutzerklärung der Plattform beschreibt genau diese Ereignisse. Neue Arten von Daten (andere Felder oder
Inhalte) **vorher mit Ben und dem Plattform-Chat abstimmen**, damit die Datenschutzerklärung angepasst werden kann.
