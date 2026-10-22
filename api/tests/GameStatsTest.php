<?php
// Spielstatistik (Phase 5b): Ereignisse, Zuordnung zum Konto, Widerspruch, Auswertung.

declare(strict_types=1);

use BensGames\GameStats;
use BensGames\Request;

const VISIT = '0123456789abcdef0123456789abcdef';

function sendEvents(TestApp $app, array $events, array $cookies = [], string $visit = VISIT, string $game = 'nova-bastion'): BensGames\Response
{
    return $app->post('events', ['app' => $game, 'visit' => $visit, 'events' => $events], [], $cookies);
}

test('Ereignisse werden streng geprüft – keine Freitexte', function (): void {
    same(null, GameStats::normalizeEvent(['type' => 'irgendwas']));
    same(null, GameStats::normalizeEvent(['type' => 'level_start']), 'Level fehlt');
    same(null, GameStats::normalizeEvent(['type' => 'level_end', 'level' => '3', 'result' => 'vielleicht']));
    same(null, GameStats::normalizeEvent(['type' => 'level_start', 'level' => 'Level mit Leerzeichen']));

    $event = GameStats::normalizeEvent(['type' => 'level_end', 'level' => '3', 'result' => 'win', 'score' => 1200, 'stars' => 3, 'seconds' => 245,
        'data' => ['tower_laser' => 4, 'hero' => 'vega', 'name' => 'Max Mustermann', 'email' => 'a@b.de', 'Bad Key' => 1, 'neg' => -5]]);
    same('{"tower_laser":4,"hero":"vega"}', $event['data']);
    same(600, GameStats::normalizeEvent(['type' => 'heartbeat', 'seconds' => 99999])['seconds'], 'Herzschlag begrenzt');
    same(null, GameStats::normalizeEvent(['type' => 'level_end', 'level' => '1', 'result' => 'win', 'score' => -1])['score']);
});

dbTest('Gäste anonym, Angemeldete mit Konto', function (): void {
    $app = new TestApp();
    same(202, sendEvents($app, [['type' => 'start'], ['type' => 'heartbeat', 'seconds' => 60]])->status);
    same(null, $app->pdo->query('SELECT user_id FROM game_events LIMIT 1')->fetchColumn() ?: null);

    $session = $app->signedIn();
    sendEvents($app, [['type' => 'heartbeat', 'seconds' => 30]], $session['cookies']);
    same($app->userId('ben@example.org'), (int) $app->pdo->query('SELECT user_id FROM game_events WHERE user_id IS NOT NULL')->fetchColumn());
    check(!str_contains(implode(',', $app->pdo->query('SHOW COLUMNS FROM game_events')->fetchAll(PDO::FETCH_COLUMN)), 'ip'), 'IP-Spalte vorhanden');
});

dbTest('Prüfungen: fremde Seite, unbekanntes Spiel, zu viele Ereignisse, ungültige Kennung', function (): void {
    $app = new TestApp();
    same(403, $app->post('events', ['app' => 'nova-bastion', 'visit' => VISIT, 'events' => [['type' => 'start']]], ['origin' => 'https://boese.example'])->status);
    same(404, sendEvents($app, [['type' => 'start']], [], VISIT, 'gibt-es-nicht')->status);
    same(422, sendEvents($app, array_fill(0, 51, ['type' => 'start']))->status);
    same(422, sendEvents($app, [['type' => 'start']], [], 'nicht-hex')->status);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM game_events')->fetchColumn());
});

dbTest('Widerspruch: neue und bisherige Statistik werden vom Konto getrennt', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    sendEvents($app, [['type' => 'heartbeat', 'seconds' => 120]], $session['cookies']);

    $mine = $app->api->handle(new Request('GET', 'account/stats', [], '', $session['cookies']));
    same(false, $mine->body['opt_out']);
    same(120, $mine->body['games'][0]['seconds']);

    same(200, $app->postAs($session, 'account/stats/settings', ['opt_out' => true])->status);
    sendEvents($app, [['type' => 'heartbeat', 'seconds' => 60]], $session['cookies']);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM game_events WHERE user_id IS NOT NULL')->fetchColumn());
    same(2, (int) $app->pdo->query('SELECT COUNT(*) FROM game_events')->fetchColumn(), 'anonym weiter gezählt');
    same([], $app->api->handle(new Request('GET', 'account/stats', [], '', $session['cookies']))->body['games']);
});

dbTest('Konto löschen: Statistik bleibt nur anonym', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    sendEvents($app, [['type' => 'heartbeat', 'seconds' => 60]], $session['cookies']);
    $app->postAs($session, 'account/delete', ['password' => 'ein sicheres Passwort', 'confirm' => true]);
    same(1, (int) $app->pdo->query('SELECT COUNT(*) FROM game_events WHERE user_id IS NULL')->fetchColumn());
});

dbTest('Auswertung: Spielzeit, schwerstes Level, Abbrüche, Zusatzwerte', function (): void {
    $app = new TestApp();
    $events = [['type' => 'start'], ['type' => 'heartbeat', 'seconds' => 300], ['type' => 'heartbeat', 'seconds' => 300]];
    for ($i = 0; $i < 6; $i++) {
        $events[] = ['type' => 'level_start', 'level' => '1'];
        $events[] = ['type' => 'level_end', 'level' => '1', 'result' => $i < 5 ? 'win' : 'lose', 'score' => 1000 + $i, 'stars' => 3, 'seconds' => 100, 'data' => ['tower_laser' => 2]];
        $events[] = ['type' => 'level_start', 'level' => '2'];
        $events[] = ['type' => 'level_end', 'level' => '2', 'result' => ['win', 'lose', 'lose', 'lose', 'abort', 'abort'][$i], 'score' => 500, 'seconds' => 200, 'data' => ['tower_frost' => 1]];
    }
    same(202, sendEvents($app, array_slice($events, 0, 15))->status);
    same(202, sendEvents($app, array_slice($events, 15), [], 'fedcba9876543210fedcba9876543210')->status);

    $stats = new GameStats($app->pdo, new BensGames\Clock(fn (): int => $app->time), new BensGames\RateLimiter($app->pdo, new BensGames\Clock(fn (): int => $app->time)));
    $report = $stats->report(['app' => 'nova-bastion', 'days' => '30'])->body;
    same(600, $report['totals']['seconds']);
    same(2, $report['totals']['visits']);
    same(300, $report['totals']['avg_seconds_per_visit']);
    same(['1', '2'], array_column($report['levels'], 'level'));
    same(5, $report['levels'][0]['wins']);
    same(0.833, $report['levels'][0]['win_rate']);
    same(1005, $report['levels'][0]['max_score']);
    same(['2', '1'], $report['hardest']);
    same(['2'], $report['most_abandoned']);
    same(['key' => 'tower_laser', 'total' => 12], $report['details'][0]);
});

dbTest('Zentrale: Spiele-Auswertung nur mit stats.view, Spieler-Statistik zusätzlich mit users.view', function (): void {
    $app = new TestApp();
    $secret = accountWith2fa($app, 'owner@example.org', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    $player = $app->signedIn('spieler@example.org', 'ein sicheres Passwort', 'Spielerin');
    sendEvents($app, [['type' => 'heartbeat', 'seconds' => 90]], $player['cookies']);

    $admin = adminLogin($app, 'owner@example.org', $secret);
    same(200, $app->adminGet('admin/games', $admin, ['app' => 'nova-bastion'])->status);
    $stats = $app->adminGet('admin/users/stats', $admin, ['id' => (string) $app->userId('spieler@example.org')]);
    same(90, $stats->body['games'][0]['seconds']);
    $list = $app->adminGet('admin/users', $admin, ['q' => 'Spielerin']);
    same(90, $list->body['users'][0]['playtime_seconds']);

    $modSecret = accountWith2fa($app, 'mod@example.org', 'Mona');
    $app->grantRole('mod@example.org', 'moderator');
    $mod = adminLogin($app, 'mod@example.org', $modSecret);
    same(403, $app->adminGet('admin/games', $mod)->status, 'Moderator ohne stats.view');
    same(403, $app->adminGet('admin/users/stats', $mod, ['id' => (string) $app->userId('spieler@example.org')])->status);
    check(!array_key_exists('playtime_seconds', $app->adminGet('admin/users', $mod)->body['users'][0]), 'Spielzeit ohne Recht sichtbar');
});

dbTest('Aufräumen löscht Statistik nach 90 Tagen', function (): void {
    $app = new TestApp();
    sendEvents($app, [['type' => 'start']]);
    $app->time += 91 * 86400;
    same(1, $app->api->handle(new Request('POST', 'admin/cleanup', ['x-maintenance-token' => TEST_MIGRATION_TOKEN]))->body['deleted']['game_events']);
});
