<?php
// Profil: Avatar und Anzeigename ändern; Rekord und Profilbilder in Ranglisten.

declare(strict_types=1);

use BensGames\Request;

dbTest('Avatar wählen: nur erlaubte Motive und Farben', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    same(422, $app->postAs($session, 'account/profile', ['avatar' => 'erfunden', 'avatar_color' => 'indigo'])->status);
    same(422, $app->postAs($session, 'account/profile', ['avatar' => 'crown', 'avatar_color' => 'pink'])->status);
    same(422, $app->postAs($session, 'account/profile', ['avatar' => '<svg onload=x>', 'avatar_color' => 'indigo'])->status);

    $ok = $app->postAs($session, 'account/profile', ['avatar' => 'crown', 'avatar_color' => 'amber']);
    same(200, $ok->status);
    same('crown', $ok->body['user']['avatar']);
    $me = $app->get('account/me', $session['cookies']);
    same('amber', $me->body['user']['avatar_color']);

    same(null, $app->postAs($session, 'account/profile', ['avatar' => null])->body['user']['avatar'], 'zurück zum Anfangsbuchstaben');
});

dbTest('Namen ändern: eindeutig, nicht reserviert, höchstens dreimal am Tag', function (): void {
    $app = new TestApp();
    $app->registered('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $session = $app->signedIn('max@example.org', 'ein sicheres Passwort', 'Max');
    same('Dieser Name ist schon vergeben.', $app->postAs($session, 'account/profile', ['display_name' => 'ANNA'])->body['fields']['display_name']);
    check(str_contains($app->postAs($session, 'account/profile', ['display_name' => 'Admin'])->body['fields']['display_name'], 'reserviert'), 'reservierter Name');
    same('max', $app->postAs($session, 'account/profile', ['display_name' => 'max'])->body['user']['display_name'], 'nur Groß-/Kleinschreibung');
    same(200, $app->postAs($session, 'account/profile', ['display_name' => 'Maxi'])->status);
    same(200, $app->postAs($session, 'account/profile', ['display_name' => 'Maximilian'])->status);
    same(429, $app->postAs($session, 'account/profile', ['display_name' => 'Max2'])->status, 'vierte Änderung');
    same(200, $app->postAs($session, 'account/profile', ['display_name' => 'Maximilian'])->status, 'unverändert zählt nicht');
});

dbTest('Rangliste: Rekord aller Zeiten und Profilbilder', function (): void {
    $app = new TestApp();
    $lea = $app->signedIn('lea@example.org', 'ein sicheres Passwort', 'Lea');
    $app->postAs($lea, 'account/profile', ['avatar' => 'rocket', 'avatar_color' => 'sky']);
    $app->postAs($lea, 'games/nova-bastion/scores', ['board' => '1', 'score' => 9000]);
    $app->time += 8 * 86400; // neue Woche: Woche leer, Rekord bleibt

    $board = $app->api->handle(new Request('GET', 'games/nova-bastion/leaderboard', [], '', [], '203.0.113.7', ['board' => '1']));
    same([], $board->body['entries']);
    same('Lea', $board->body['record']['display_name']);
    same(9000, $board->body['record']['score']);
    same('rocket', $board->body['record']['avatar']);

    $all = $app->api->handle(new Request('GET', 'games/nova-bastion/leaderboard', [], '', [], '203.0.113.7', ['board' => '1', 'period' => 'all']));
    same('sky', $all->body['entries'][0]['avatar_color']);
});

dbTest('Webseite: account/status immer 200, Mein Konto kennt den Zugang zur Zentrale', function (): void {
    $app = new TestApp();
    $guest = $app->get('account/status');
    same(200, $guest->status);
    same(null, $guest->body['user']);
    same(401, $app->get('account/me')->status, 'Spiele nutzen weiter 401');

    $session = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    same('Anna', $app->get('account/status', $session['cookies'])->body['user']['display_name']);
    check(!isset($app->get('account/status', $session['cookies'])->body['csrf']), 'kein CSRF-Token in der Statusabfrage');
    same(false, $app->get('account/me', $session['cookies'])->body['user']['panel']);
    $app->grantRole('anna@example.org', 'moderator');
    same(true, $app->get('account/me', $session['cookies'])->body['user']['panel']);
});
