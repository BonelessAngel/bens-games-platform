<?php
// Räume für Mehrspieler-Partien (docs/raeume-api.md).

declare(strict_types=1);

use BensGames\Request;
use BensGames\Response;

/** POST an einen Raum-Endpunkt, wahlweise mit Platz-Token und angemeldeter Sitzung. */
function roomPost(TestApp $app, string $path, array $json = [], ?string $token = null, ?array $session = null, string $ip = '203.0.113.7'): Response
{
    $headers = [];
    if ($token !== null) {
        $headers['x-room-token'] = $token;
    }
    if ($session !== null) {
        $headers['x-csrf-token'] = $session['csrf'];
    }
    return $app->post("games/drei-fronten/rooms/$path", $json, $headers, $session['cookies'] ?? [], $ip);
}

function roomPoll(TestApp $app, string $code, ?string $token, int $after = 0): Response
{
    $headers = $token === null ? [] : ['x-room-token' => $token];
    return $app->api->handle(new Request('GET', 'games/drei-fronten/rooms/poll', $headers, '', [], '203.0.113.7', ['code' => $code, 'after' => (string) $after]));
}

dbTest('Räume: erstellen, beitreten, starten und Aktionen der Reihe nach', function (): void {
    $app = new TestApp();
    $host = roomPost($app, 'create', ['max_players' => 2, 'visibility' => 'private', 'mode' => 'duell']);
    same(200, $host->status);
    $code = $host->body['room']['code'];
    check((bool) preg_match('/^[A-HJ-NP-Z2-9]{6}$/', $code), "Code $code");
    same(0, $host->body['you']['seat']);
    check((bool) preg_match('/^[0-9a-f]{64}$/', $host->body['you']['token']), 'Token');
    check(str_starts_with($host->body['room']['players'][0]['name'], 'Gast '), 'Gastname');
    same(false, $host->body['room']['players'][0]['account']);
    same(null, $host->body['room']['seed']);
    $hostToken = $host->body['you']['token'];

    $guest = roomPost($app, 'join', ['code' => strtolower($code)]);
    same(200, $guest->status);
    same(1, $guest->body['you']['seat']);
    $guestToken = $guest->body['you']['token'];
    same(2, count($guest->body['room']['players']));

    $started = roomPost($app, 'start', [], $hostToken);
    same(200, $started->status);
    same('playing', $started->body['room']['status']);
    check(is_int($started->body['room']['seed']), 'seed nach dem Start');

    same(1, roomPost($app, 'action', ['data' => ['type' => 'plan', 'zug' => 1]], $hostToken)->body['seq']);
    same(2, roomPost($app, 'action', ['data' => ['type' => 'plan', 'zug' => 1]], $guestToken)->body['seq']);

    $poll = roomPoll($app, $code, $guestToken);
    same(200, $poll->status);
    same([1, 2], array_column($poll->body['actions'], 'seq'));
    same([0, 1], array_column($poll->body['actions'], 'seat'));
    same(['type' => 'plan', 'zug' => 1], $poll->body['actions'][0]['data']);
    same(2, $poll->body['last_seq']);
    same(1, count(roomPoll($app, $code, $hostToken, 1)->body['actions']));
    same($started->body['room']['seed'], $poll->body['room']['seed'], 'gleicher seed für alle');
});

dbTest('Räume: Fehlerfälle', function (): void {
    $app = new TestApp();
    same(404, roomPost($app, 'join', ['code' => 'ZZZZZZ'])->status);
    same(422, roomPost($app, 'join', ['code' => 'abc'])->status);
    same(422, roomPost($app, 'create', ['max_players' => 9])->status);
    same(422, roomPost($app, 'create', ['visibility' => 'geheim'])->status);
    same(404, $app->post('games/gibt-es-nicht/rooms/create', [])->status);

    $host = roomPost($app, 'create', ['max_players' => 2]);
    $code = $host->body['room']['code'];
    $hostToken = $host->body['you']['token'];
    same(403, roomPoll($app, $code, null)->status, 'ohne Token');
    same(403, roomPoll($app, $code, str_repeat('a', 64))->status, 'falsches Token');
    same(409, roomPost($app, 'start', [], $hostToken)->status, 'allein starten');
    same(409, roomPost($app, 'action', ['data' => ['x' => 1]], $hostToken)->status, 'vor dem Start');

    $guest = roomPost($app, 'join', ['code' => $code]);
    same(409, roomPost($app, 'join', ['code' => $code])->status, 'voll');
    same('room_full', roomPost($app, 'join', ['code' => $code])->body['error']);
    same(403, roomPost($app, 'start', [], $guest->body['you']['token'])->status, 'nur Gastgeber');
    same(200, roomPost($app, 'start', [], $hostToken)->status);
    same('already_started', roomPost($app, 'join', ['code' => $code])->body['error']);
    same(422, roomPost($app, 'action', ['data' => 'kein Objekt'], $hostToken)->status);
    same(413, roomPost($app, 'action', ['data' => ['text' => str_repeat('x', 5000)]], $hostToken)->status);
    same(403, roomPost($app, 'finish', ['results' => []], $guest->body['you']['token'])->status);

    $finished = roomPost($app, 'finish', ['results' => [['seat' => 0, 'place' => 1, 'score' => 4], ['seat' => 1, 'place' => 2, 'score' => 2]]], $hostToken);
    same(200, $finished->status);
    same('finished', $finished->body['room']['status']);
});

dbTest('Räume: Konten nur mit CSRF-Token, Rückkehr mit neuem Token', function (): void {
    $app = new TestApp();
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $noCsrf = $app->post('games/drei-fronten/rooms/create', [], [], $anna['cookies']);
    same(403, $noCsrf->status);
    same('csrf', $noCsrf->body['error']);

    $room = roomPost($app, 'create', [], null, $anna);
    same(200, $room->status);
    same('Anna', $room->body['room']['players'][0]['name']);
    same(true, $room->body['room']['players'][0]['account']);
    $code = $room->body['room']['code'];
    $oldToken = $room->body['you']['token'];

    // Gast tritt bei, Anna kommt (z. B. von einem anderen Gerät) zurück: gleicher Platz, neues Token.
    roomPost($app, 'join', ['code' => $code]);
    same(200, roomPost($app, 'start', [], $oldToken)->status);
    $back = roomPost($app, 'join', ['code' => $code], null, $anna);
    same(200, $back->status, 'Konto darf in die laufende Partie zurück');
    same(0, $back->body['you']['seat']);
    same(403, roomPoll($app, $code, $oldToken)->status, 'altes Token gilt nicht mehr');
    same(200, roomPoll($app, $code, $back->body['you']['token'])->status);
});

dbTest('Räume: verlassen, Gastgeber wandert weiter, entfernen in der Lobby', function (): void {
    $app = new TestApp();
    $host = roomPost($app, 'create', ['max_players' => 3]);
    $code = $host->body['room']['code'];
    $b = roomPost($app, 'join', ['code' => $code]);
    $c = roomPost($app, 'join', ['code' => $code]);
    same(2, $c->body['you']['seat']);

    same(200, roomPost($app, 'kick', ['seat' => 2], $host->body['you']['token'])->status);
    same(403, roomPoll($app, $code, $c->body['you']['token'])->status, 'entfernt');
    same(403, roomPost($app, 'kick', ['seat' => 0], $b->body['you']['token'])->status, 'nur Gastgeber entfernt');

    same(200, roomPost($app, 'leave', [], $host->body['you']['token'])->status);
    $after = roomPoll($app, $code, $b->body['you']['token']);
    same(1, $after->body['room']['host_seat'], 'neuer Gastgeber');
    same([1], array_column($after->body['room']['players'], 'seat'), 'Platz in der Lobby frei');

    // Neuer Mitspieler bekommt den freien Platz 0.
    $d = roomPost($app, 'join', ['code' => $code]);
    same(0, $d->body['you']['seat']);
    same(200, roomPost($app, 'start', [], $b->body['you']['token'])->status);
    same(200, roomPost($app, 'leave', [], $d->body['you']['token'])->status);
    $left = roomPoll($app, $code, $b->body['you']['token']);
    same(true, $left->body['room']['players'][0]['left'], 'in der Partie: verlassen');
    same(200, roomPost($app, 'leave', [], $b->body['you']['token'])->status);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM rooms')->fetchColumn(), 'leerer Raum wird gelöscht');
});

dbTest('Räume: schnelles Spiel füllt offene öffentliche Räume', function (): void {
    $app = new TestApp();
    $a = roomPost($app, 'quick', ['mode' => 'duell', 'max_players' => 2]);
    same('public', $a->body['room']['visibility']);
    $b = roomPost($app, 'quick', ['mode' => 'duell', 'max_players' => 2]);
    same($a->body['room']['code'], $b->body['room']['code']);
    same(1, $b->body['you']['seat']);
    $other = roomPost($app, 'quick', ['mode' => 'team', 'max_players' => 2]);
    check($other->body['room']['code'] !== $a->body['room']['code'], 'anderer Modus, anderer Raum');
    $c = roomPost($app, 'quick', ['mode' => 'duell', 'max_players' => 2]);
    check($c->body['room']['code'] !== $a->body['room']['code'], 'voller Raum wird übersprungen');
    // Privat erstellte Räume tauchen nie im schnellen Spiel auf.
    $private = roomPost($app, 'create', ['mode' => 'solo', 'max_players' => 2]);
    $d = roomPost($app, 'quick', ['mode' => 'solo', 'max_players' => 2]);
    check($d->body['room']['code'] !== $private->body['room']['code'], 'private Räume bleiben privat');
});

dbTest('Räume: online-Anzeige, Ablauf und Aufräumen', function (): void {
    $app = new TestApp();
    $host = roomPost($app, 'create', []);
    $code = $host->body['room']['code'];
    $guest = roomPost($app, 'join', ['code' => $code]);
    $app->time += 20;
    $poll = roomPoll($app, $code, $host->body['you']['token']);
    same([true, false], array_column($poll->body['room']['players'], 'online'));

    // Lobby ohne Aktivität: nach 30 Minuten weg.
    $app->time += 1800;
    same(404, roomPoll($app, $code, $guest->body['you']['token'])->status);

    // Laufende Partie: spätestens nach 24 Stunden weg (tägliche Aufräumrunde).
    $room = roomPost($app, 'create', []);
    roomPost($app, 'join', ['code' => $room->body['room']['code']]);
    roomPost($app, 'start', [], $room->body['you']['token']);
    $app->time += 3600;
    roomPost($app, 'action', ['data' => ['a' => 1]], $room->body['you']['token']);
    same(200, roomPoll($app, $room->body['room']['code'], $room->body['you']['token'])->status, 'nach 1 h noch da');
    $app->time += 86400;
    $deleted = $app->api->handle(new Request('POST', 'admin/cleanup', ['x-maintenance-token' => TEST_MIGRATION_TOKEN]))->body['deleted'];
    same(1, $deleted['rooms']);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM room_actions')->fetchColumn(), 'Aktionen mit gelöscht');
});

dbTest('Räume: Raten von Codes wird gebremst', function (): void {
    $app = new TestApp();
    $last = null;
    for ($i = 0; $i < 61; $i++) {
        $last = roomPost($app, 'join', ['code' => 'QQQQQQ'], null, null, '198.51.100.20');
    }
    same(429, $last->status);
    same(404, roomPost($app, 'join', ['code' => 'QQQQQQ'], null, null, '192.0.2.99')->status, 'andere Adresse nicht betroffen');
});
