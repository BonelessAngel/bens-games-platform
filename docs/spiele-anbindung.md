# Spiele mit der Webseite verbinden – Startbildschirm und Komfort

Stand: 23.10.2026. Gilt für alle Spiele unter `bens-games.de/games/<id>/` (Nova Bastion, Royal Blocks, neue Spiele).
Die Plattform (Repo `bens-games-platform`, Claude) stellt alles hier Beschriebene bereit; umgesetzt wird es im Repo
des Spiels von dem Agenten, den Ben dafür festgelegt hat. Ergänzt `spielstaende-api.md`, `statistik-api.md` und
`ranglisten-api.md`.

## Grundregeln

- **Das Spiel bleibt ohne Webseite voll spielbar** (offline, lokal, ohne Konto). Jeder Aufruf hier ist eine Zugabe:
  höchstens 3 Sekunden warten (`AbortController`), Fehler still schlucken, nie den Start blockieren.
- Nur auf der Plattform aktiv: Pfad beginnt mit `/games/`, nicht `localhost`/`127.0.0.1`, nicht `file:`, nicht im Dev-Modus.
- Texte von der API immer mit `textContent` anzeigen, nie mit `innerHTML`.
- Der Service Worker des Spiels darf `/api/…` nie zwischenspeichern (sonst sieht man veraltete Anmeldungen).
  Bilder unter `/avatars/` dürfen gecacht werden.
- Keine Anmeldedaten, Tokens oder E-Mail-Adressen speichern. Neue Datenverarbeitung nur nach Absprache mit Ben
  und dem Plattform-Chat (die Datenschutzerklärung muss vorher angepasst werden).
- Aussehen passt zum Spiel (Schrift, Farben, Pixel-Look) – die Webseite gibt nur Daten und Links vor.

## 1. „Zurück zur Webseite“ auf dem Startbildschirm

- Ein gut sichtbarer, aber zurückhaltender Knopf, z. B. oben links: **„← Bens Games“**.
- Ziel: `href="/"` im selben Tab (normaler Link, kein `window.open`).
- Nur anzeigen, wenn das Spiel auf der Plattform läuft (siehe Grundregeln). Läuft das Spiel als installierte App,
  zeigt das Gerät beim Wechsel auf die Webseite eine kleine Browserleiste – das ist gewollt.
- Optional zusätzlich im Pause- oder Einstellungsmenü.

## 2. Startbildschirm-Daten: `GET /api/games/<id>/hub`

Eine Anfrage liefert alles, was der Startbildschirm braucht (ohne Anmeldung möglich, `credentials: 'same-origin'`):

```json
{
  "user": {
    "display_name": "Anna",
    "initial": "A",
    "avatar_url": "/avatars/fox-amber.svg",
    "listed": true,
    "profile_url": "/spieler/?name=Anna",
    "dev": false
  },
  "best": [ { "board": "2", "score": 9800, "rank": 1 } ],
  "announcements": [ { "id": 7, "title": "Neues Level!", "body": "…", "link": "/ranglisten/", "level": "success" } ],
  "links": {
    "website": "/",
    "rankings": "/ranglisten/?spiel=nova-bastion",
    "login": "/konto/anmelden/?zurueck=%2Fgames%2Fnova-bastion%2F",
    "register": "/konto/registrieren/?zurueck=%2Fgames%2Fnova-bastion%2F",
    "account": "/konto/"
  }
}
```

- `user` ist `null`, wenn niemand angemeldet ist.
- `avatar_url` ist ein fertiges rundes Bild (`<img>`, 96 × 96). Ist es `null`, einen Kreis mit `initial` zeichnen.
- `dev` ist `true` nur für Konten mit dem Recht `app.<id>.manage` (Besitzer immer). Damit darf das Spiel seine
  Entwickler-Werkzeuge freischalten – nur lokal auf diesem Gerät, in einem getrennten Spielstand, ohne Statistik und Ranglisten.
- `profile_url` ist `null`, wenn das Konto nicht in Ranglisten erscheint – dann keinen Profil-Link zeigen.
- `best`: höchstens drei Bestwerte dieses Spiels, beste Plätze zuerst. `rank` kann `null` sein.
- `404` = unbekanntes Spiel (z. B. lokal), dann den Bereich einfach weglassen.

**Empfohlene Anzeige auf dem Startbildschirm**

- Angemeldet: Profilbild + „Angemeldet als **Anna** · Fortschritt wird gesichert“. Darunter, wenn vorhanden,
  „🏆 Platz 1 in Level 2“ (Rangliste lesbar machen wie auf der Webseite: Zahl → „Level N“).
  Knöpfe: „Rangliste“ (`links.rankings`), „Mein Profil“ (`profile_url`).
- Nicht angemeldet: „Mit Konto spielst du auf allen Geräten weiter und erscheinst in der Rangliste.“
  Knöpfe „Anmelden“ (`links.login`) und „Konto erstellen“ (`links.register`).
  Nach Anmeldung bzw. nach Registrierung und E-Mail-Bestätigung kommt man automatisch ins Spiel zurück.

## 3. Ankündigungen

Kommen mit dem Startbildschirm-Aufruf (oder einzeln über `GET /api/announcements?app=<id>`).
Die neueste nicht weggeklickte als kleines Banner zeigen, mit „×“ zum Ausblenden. Weggeklickte IDs lokal merken
(z. B. `<id>:dismissed`, nur Zahlen, höchstens 50). `link` ist ein Pfad dieser Webseite (`/…`) oder `https://…` – nur dann
als Link zeigen. Farben: `info` neutral, `success` grün, `warning` orange.

## 4. Nach einer Runde

- Die Antwort von `POST /api/games/<id>/scores` enthält den Platz (`week.rank`, `all.rank`).
  Zeigen: „Platz 3 diese Woche“, bei neuem Bestwert hervorheben.
- Knopf „Rangliste ansehen“ → `/ranglisten/?spiel=<id>&liste=<board>` (öffnet direkt die richtige Liste).
- Knopf „Teilen“: `navigator.share({ title, text, url })`, sonst `navigator.clipboard.writeText`. Als `url` den
  Ranglisten-Link mit `https://bens-games.de` davor (`location.origin`). Keine Share-Widgets von Dritten.

## 5. Neue Version verfügbar

Wenn der Service Worker eine neue Version gefunden hat (`registration.onupdatefound` → neuer Worker `installed`,
während schon einer aktiv ist), einen Hinweis zeigen: „Neue Version verfügbar – Neu laden“. Beim Klick den neuen Worker
aktivieren (`postMessage({ type: 'SKIP_WAITING' })` o. Ä.) und neu laden. Nie mitten in einer Runde automatisch neu laden.

## 6. Erfolge mit Namen

Das Spiel kann `achievements.json` im Build-Ordner mitliefern (siehe `ranglisten-api.md`), z. B.
`{ "stars30": { "name": "30 Sterne", "icon": "⭐" } }`. Dann zeigen „Mein Konto“ und das Spielerprofil schöne Abzeichen.
Die Datei muss in `lib/games.js` der Plattform unter `files` stehen – das trägt der Plattform-Chat beim Einbinden ein.

## 7. Fehlermeldungen: `POST /api/errors`

Unerwartete Fehler meldet das Spiel an die Zentrale (Reiter „Fehler“). Nur auf der Plattform (https, Pfad `/games/<id>/`),
nicht wenn `navigator.globalPrivacyControl === true`, gleiche Fehler nur einmal und **höchstens 5 Meldungen pro Besuch**.

```js
fetch('/api/errors', {
  method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app: '<id>', message, source, line, col, stack }), // nichts weiter!
}).catch(() => {});
```

Auslöser: `window.addEventListener('error', …)` und `window.addEventListener('unhandledrejection', …)`.
Keine Konto-, Spielstand- oder Spielerdaten mitschicken. Der Server kürzt Adressen auf den Pfad, macht E-Mail-Adressen und
lange Zahlen unkenntlich, ergänzt Spielversion und Browser-Familie und löscht nach 90 Tagen. Antwort `202`, bei zu vielen
Meldungen `429` – beides still ignorieren. Vorbild: `platformError` in Nova Bastion (`Quelltext/17-plattform.js`).

## 8. Prüfliste vor dem Tag

- [ ] Spiel startet ohne Netz, ohne Konto und lokal ohne Fehler in der Konsole.
- [ ] Knopf „← Bens Games“ nur auf der Plattform sichtbar, führt zu `/`.
- [ ] Startbildschirm zeigt angemeldet/abgemeldet korrekt, Anmelden führt zurück ins Spiel.
- [ ] Ankündigung lässt sich wegklicken und bleibt weg.
- [ ] Ranglisten-Link öffnet die richtige Liste.
- [ ] Alle API-Texte per `textContent`.
