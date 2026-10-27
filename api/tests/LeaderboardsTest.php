<?php
// Ranglisten, Moderation und App-Verwaltung (Phase 4b).

declare(strict_types=1);

use BensGames\Request;

function board(TestApp $app, array $query = [], array $cookies = [], string $game = 'nova-bastion'): BensGames\Response
{
    return $app->api->handle(new Request('GET', "games/$game/leaderboard", [], '', $cookies, '203.0.113.7', $query));
}

dbTest('Punkte melden nur angemeldet und mit CSRF-Token', function (): void {
    $app = new TestApp();
    same(401, $app->post('games/nova-bastion/scores', ['board' => '1', 'score' => 100])->status);
    $session = $app->signedIn();
    same(403, $app->post('games/nova-bastion/scores', ['board' => '1', 'score' => 100], [], $session['cookies'])->status);
    same(422, $app->postAs($session, 'games/nova-bastion/scores', ['board' => 'mit leerzeichen', 'score' => 100])->status);
    same(422, $app->postAs($session, 'games/nova-bastion/scores', ['board' => '1', 'score' => -5])->status);
    same(404, $app->postAs($session, 'games/gibt-es-nicht/scores', ['board' => '1', 'score' => 1])->status);
    $ok = $app->postAs($session, 'games/nova-bastion/scores', ['board' => '1', 'score' => 100]);
    same(200, $ok->status);
    same(1, $ok->body['week']['rank']);
    same(1, $ok->body['all']['rank']);
});

dbTest('Bestwert zählt, Reihenfolge nach Punkten und bei Gleichstand nach Zeitpunkt', function (): void {
    $app = new TestApp();
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $max = $app->signedIn('max@example.org', 'ein sicheres Passwort', 'Max');
    $lea = $app->signedIn('lea@example.org', 'ein sicheres Passwort', 'Lea');

    $app->postAs($anna, 'games/nova-bastion/scores', ['board' => '1', 'score' => 500]);
    $app->postAs($anna, 'games/nova-bastion/scores', ['board' => '1', 'score' => 300]); // schlechter – zählt nicht
    $app->time += 10;
    $app->postAs($max, 'games/nova-bastion/scores', ['board' => '1', 'score' => 500]); // gleich, aber später
    $app->postAs($lea, 'games/nova-bastion/scores', ['board' => '1', 'score' => 900]);

    $list = board($app, ['board' => '1'], $max['cookies']);
    same(200, $list->status);
    same(['Lea', 'Anna', 'Max'], array_column($list->body['entries'], 'display_name'));
    same([900, 500, 500], array_column($list->body['entries'], 'score'));
    same([false, false, true], array_column($list->body['entries'], 'me'));
    same(3, $list->body['me']['rank']);
    check(!isset($list->body['entries'][0]['email']) && !isset($list->body['entries'][0]['user_id']), 'zu viele Daten öffentlich');

    same('Lea', board($app, ['board' => '1', 'period' => 'all'])->body['entries'][0]['display_name'], 'gesamt, ohne Anmeldung');
});

dbTest('Neue Woche: „diese Woche“ startet leer, „gesamt“ bleibt; alte Wochen werden aufgeräumt', function (): void {
    $app = new TestApp();
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $app->postAs($anna, 'games/nova-bastion/scores', ['board' => 'endlos', 'score' => 42]);
    $app->time += 7 * 86400;
    same([], board($app, ['board' => 'endlos'])->body['entries'], 'neue Woche');
    same(42, board($app, ['board' => 'endlos', 'period' => 'all'])->body['entries'][0]['score']);

    $app->time += 9 * 7 * 86400;
    $deleted = $app->api->handle(new Request('POST', 'admin/cleanup', ['x-maintenance-token' => TEST_MIGRATION_TOKEN]))->body['deleted'];
    same(1, $deleted['leaderboard_weeks']);
    same(1, (int) $app->pdo->query("SELECT COUNT(*) FROM leaderboard_entries WHERE period = 'all'")->fetchColumn());
});

dbTest('Ranglisten: Hauptmodus zuerst, dann natürlich sortiert, Archiv zuletzt', function (): void {
    $app = new TestApp();
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    foreach (['10', '2', '1', 'endlos'] as $level) {
        $app->postAs($anna, 'games/nova-bastion/scores', ['board' => $level, 'score' => 1]);
    }
    same(['endlos', '1', '2', '10'], board($app)->body['boards']);
    same('endlos', board($app)->body['board'], 'ohne Auswahl der Hauptmodus');
    foreach (['klassisch', 'taeglich', 'profi', 'standard'] as $mode) {
        $app->postAs($anna, 'games/royal-blocks/scores', ['board' => $mode, 'score' => 1]);
    }
    same(['standard', 'profi', 'taeglich', 'klassisch'], board($app, [], [], 'royal-blocks')->body['boards']);
});

dbTest('Eigene Position: Gesamtzahl, Abstand zum nächsten Platz, Wochenende', function (): void {
    $app = new TestApp();
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $max = $app->signedIn('max@example.org', 'ein sicheres Passwort', 'Max');
    $lea = $app->signedIn('lea@example.org', 'ein sicheres Passwort', 'Lea');
    $app->postAs($anna, 'games/nova-bastion/scores', ['board' => '1', 'score' => 900]);
    $app->postAs($max, 'games/nova-bastion/scores', ['board' => '1', 'score' => 700]);
    $app->postAs($lea, 'games/nova-bastion/scores', ['board' => '1', 'score' => 500]);
    $list = board($app, ['board' => '1'], $lea['cookies']);
    same(3, $list->body['total']);
    same(3, $list->body['me']['rank']);
    same(201, $list->body['me']['ahead'], '201 Punkte bis Platz 2');
    same(null, board($app, ['board' => '1'], $anna['cookies'])->body['me']['ahead'], 'Platz 1 hat niemanden vor sich');
    check((bool) preg_match('/^\d{4}-\d{2}-\d{2}T00:00:00Z$/', $list->body['week_ends']), 'Wochenende als Zeitpunkt');
    same('1', gmdate('N', strtotime($list->body['week_ends'])), 'die neue Woche beginnt montags');
});

dbTest('Widerspruch, gesperrte Konten und gelöschte Konten erscheinen nicht', function (): void {
    $app = new TestApp();
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $max = $app->signedIn('max@example.org', 'ein sicheres Passwort', 'Max');
    $lea = $app->signedIn('lea@example.org', 'ein sicheres Passwort', 'Lea');
    foreach ([$anna, $max, $lea] as $i => $session) {
        $app->postAs($session, 'games/nova-bastion/scores', ['board' => '1', 'score' => 100 + $i]);
    }

    same(200, $app->postAs($anna, 'account/leaderboard/settings', ['opt_out' => true])->status);
    $app->pdo->exec("UPDATE users SET status = 'locked' WHERE display_name = 'Max'");
    same(['Lea'], array_column(board($app, ['board' => '1'])->body['entries'], 'display_name'));

    $app->postAs($lea, 'account/delete', ['password' => 'ein sicheres Passwort', 'confirm' => true]);
    same([], board($app, ['board' => '1'])->body['entries']);
    same(0, (int) $app->pdo->query("SELECT COUNT(*) FROM leaderboard_entries l JOIN users u ON u.id = l.user_id WHERE u.display_name = 'Lea'")->fetchColumn());
});

dbTest('Moderation: Einträge ausblenden nur mit Recht, mit Protokoll', function (): void {
    $app = new TestApp();
    $secret = accountWith2fa($app, 'owner@example.org', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    $cheat = $app->signedIn('cheat@example.org', 'ein sicheres Passwort', 'Schummler');
    $app->postAs($cheat, 'games/nova-bastion/scores', ['board' => '1', 'score' => 999999999]);

    $devSecret = accountWith2fa($app, 'dev@example.org', 'Devin');
    $app->grantRole('dev@example.org', 'developer');
    $dev = adminLogin($app, 'dev@example.org', $devSecret);
    same(403, $app->adminGet('admin/leaderboard', $dev)->status, 'Entwickler ohne moderation');

    $admin = adminLogin($app, 'owner@example.org', $secret);
    $list = $app->adminGet('admin/leaderboard', $admin, ['app' => 'nova-bastion', 'board' => '1']);
    same(200, $list->status);
    $entryId = (int) $list->body['entries'][0]['id'];
    same(200, $app->adminPost('admin/leaderboard/hide', ['id' => $entryId, 'hidden' => true, 'reason' => 'unmögliche Punktzahl'], $admin)->status);
    same([], board($app, ['board' => '1'])->body['entries']);
    same('admin.score_hidden', $app->adminGet('admin/audit', $admin, ['action' => 'admin'])->body['entries'][0]['action']);

    same(200, $app->adminPost('admin/leaderboard/hide', ['id' => $entryId, 'hidden' => false], $admin)->status);
    same(1, count(board($app, ['board' => '1'])->body['entries']));
});

dbTest('App-Verwaltung: Status, Sichtbarkeit und Freigaben', function (): void {
    $app = new TestApp();
    $secret = accountWith2fa($app, 'owner@example.org', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    $tester = $app->signedIn('tester@example.org', 'ein sicheres Passwort', 'Tess');
    $admin = adminLogin($app, 'owner@example.org', $secret);

    $apps = $app->adminGet('admin/apps', $admin);
    same(200, $apps->status);
    check(in_array('nova-bastion', array_column($apps->body['apps'], 'id'), true), 'Nova Bastion fehlt');

    same(422, $app->adminPost('admin/apps/update', ['id' => 'nova-bastion', 'status' => 'kaputt', 'visibility' => 'all'], $admin)->status);
    same(200, $app->adminPost('admin/apps/update', ['id' => 'nova-bastion', 'status' => 'private', 'visibility' => 'selected'], $admin)->status);
    $guestIds = array_column($app->api->handle(new Request('GET', 'apps'))->body['apps'], 'id');
    check(!in_array('nova-bastion', $guestIds, true), 'private App für Gäste sichtbar');

    same(404, $app->adminPost('admin/apps/access', ['app_id' => 'nova-bastion', 'display_name' => 'Niemand', 'grant' => true], $admin)->status);
    same(200, $app->adminPost('admin/apps/access', ['app_id' => 'nova-bastion', 'display_name' => 'tess', 'grant' => true], $admin)->status);
    $testerIds = array_column($app->api->handle(new Request('GET', 'apps', [], '', $tester['cookies']))->body['apps'], 'id');
    check(in_array('nova-bastion', $testerIds, true), 'Freigabe wirkt nicht');

    // Wer nur eine App verwalten darf, kommt in die Zentrale und sieht nur diese App.
    $devSecret = accountWith2fa($app, 'dev@example.org', 'Devin');
    $app->adminPost('admin/rights/set', ['id' => $app->userId('dev@example.org'), 'roles' => [], 'permissions' => ['app.nova-bastion.manage']], $admin);
    $dev = adminLogin($app, 'dev@example.org', $devSecret);
    same(['nova-bastion'], array_column($app->adminGet('admin/apps', $dev)->body['apps'], 'id'));
    same(403, $app->adminGet('admin/users', $dev)->status);
});
