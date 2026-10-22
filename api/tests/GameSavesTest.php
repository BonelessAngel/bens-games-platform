<?php
// Spielstände und Erfolge im Konto (Phase 4a).

declare(strict_types=1);

use BensGames\Request;

function saveOf(TestApp $app, array $session, string $game = 'nova-bastion'): BensGames\Response
{
    return $app->api->handle(new Request('GET', "games/$game/save", [], '', $session['cookies'], '203.0.113.7'));
}

dbTest('Spielstand: ohne Anmeldung nichts, danach speichern und laden', function (): void {
    $app = new TestApp();
    same(401, $app->api->handle(new Request('GET', 'games/nova-bastion/save'))->status, 'Gast');

    $session = $app->signedIn();
    $empty = saveOf($app, $session);
    same(200, $empty->status);
    same(null, $empty->body['save']);
    same([], $empty->body['achievements']);

    $data = json_encode(['camp' => ['crystals' => 120, 'ach' => ['stars30' => 1]], 't' => 1_800_000_000_000]);
    $put = $app->postAs($session, 'games/nova-bastion/save/put', ['data' => $data, 't' => 1_800_000_000_000, 'achievements' => ['stars30', 'stars30', 'laserK']]);
    same(200, $put->status);
    same(2, $put->body['achievements_added']);

    $loaded = saveOf($app, $session);
    same($data, $loaded->body['save']['data']);
    same(1_800_000_000_000, $loaded->body['save']['t']);
    same(['laserK', 'stars30'], (function (array $a): array { sort($a); return $a; })($loaded->body['achievements']));
});

dbTest('neuerer Stand gewinnt; älterer wird mit dem gespeicherten beantwortet', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    same(200, $app->postAs($session, 'games/nova-bastion/save/put', ['data' => '{"v":2}', 't' => 2000])->status);

    $older = $app->postAs($session, 'games/nova-bastion/save/put', ['data' => '{"v":1}', 't' => 1000, 'achievements' => ['alt']]);
    same(409, $older->status);
    same('newer_save', $older->body['error']);
    same('{"v":2}', $older->body['save']['data']);
    same(1, $older->body['achievements_added'], 'Erfolge vom älteren Gerät gehen nicht verloren');

    same(200, $app->postAs($session, 'games/nova-bastion/save/put', ['data' => '{"v":3}', 't' => 3000])->status);
    same('{"v":3}', saveOf($app, $session)->body['save']['data']);
});

dbTest('Spielstände sind pro Konto getrennt', function (): void {
    $app = new TestApp();
    $ben = $app->signedIn();
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $app->postAs($ben, 'games/nova-bastion/save/put', ['data' => '{"wer":"ben"}', 't' => 1]);
    same(null, saveOf($app, $anna)->body['save']);
    $app->postAs($anna, 'games/nova-bastion/save/put', ['data' => '{"wer":"anna"}', 't' => 5]);
    same('{"wer":"ben"}', saveOf($app, $ben)->body['save']['data']);
});

dbTest('Prüfungen: unbekanntes Spiel, kein JSON, zu groß, CSRF', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    same(404, saveOf($app, $session, 'gibt-es-nicht')->status);
    same(422, $app->postAs($session, 'games/nova-bastion/save/put', ['data' => 'kein json', 't' => 1])->status);
    same(422, $app->postAs($session, 'games/nova-bastion/save/put', ['data' => '{}', 't' => 'gestern'])->status);
    same(413, $app->postAs($session, 'games/nova-bastion/save/put', ['data' => json_encode(['x' => str_repeat('a', 530000)]), 't' => 1])->status);
    same(403, $app->post('games/nova-bastion/save/put', ['data' => '{}', 't' => 1], [], $session['cookies'])->status, 'ohne CSRF-Token');
    same(null, saveOf($app, $session)->body['save']);
});

dbTest('Übersicht in „Mein Konto“ und Spielstand löschen', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    $app->postAs($session, 'games/nova-bastion/save/put', ['data' => '{"a":1}', 't' => 1, 'achievements' => ['eins', 'zwei']]);

    $overview = $app->api->handle(new Request('GET', 'account/games', [], '', $session['cookies'], '203.0.113.7'));
    same(200, $overview->status);
    same('nova-bastion', $overview->body['games'][0]['id']);
    same(2, $overview->body['games'][0]['achievements']);
    same(['eins', 'zwei'], $overview->body['games'][0]['achievement_ids']);

    same(200, $app->postAs($session, 'games/nova-bastion/save/delete')->status);
    same(null, saveOf($app, $session)->body['save']);
    same([], saveOf($app, $session)->body['achievements']);
});

dbTest('Konto löschen entfernt Spielstände und Erfolge', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    $app->postAs($session, 'games/nova-bastion/save/put', ['data' => '{"a":1}', 't' => 1, 'achievements' => ['eins']]);
    same(200, $app->postAs($session, 'account/delete', ['password' => 'ein sicheres Passwort', 'confirm' => true])->status);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM game_saves')->fetchColumn());
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM game_achievements')->fetchColumn());
});
