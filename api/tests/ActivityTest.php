<?php
// Tägliche Aufgaben, Ticker und Ruhmeshalle (api/src/Activity.php).

declare(strict_types=1);

use BensGames\Activity;
use BensGames\Request;

function activityCleanup(TestApp $app): BensGames\Response
{
    return $app->api->handle(new Request('POST', 'admin/cleanup', ['x-maintenance-token' => TEST_MIGRATION_TOKEN]));
}

// Alles, was irgendeine Tagesaufgabe verlangen kann: dann sind alle drei erledigt, egal welche heute dran sind.
function playEverything(TestApp $app, array $session): void
{
    foreach ([['standard', 6000], ['standard', 100], ['taeglich', 200], ['standard', 50], ['profi', 10], ['standard', 70], ['standard', 80], ['standard', 90]] as [$board, $score]) {
        same(200, $app->postAs($session, 'games/royal-blocks/scores', ['board' => $board, 'score' => $score])->status);
    }
    same(200, $app->postAs($session, 'games/nova-bastion/scores', ['board' => '3', 'score' => 900])->status);
    same(200, $app->postAs($session, 'games/nova-bastion/scores', ['board' => 'endlos', 'score' => 12])->status);
    same(200, $app->postAs($session, 'games/royal-blocks/save/put', [
        'data' => json_encode(['version' => 1, 't' => $app->time, 'values' => []]), 't' => $app->time, 'achievements' => ['tag_' . $app->time],
    ])->status);
}

dbTest('Tägliche Aufgaben: 3 am Tag für alle gleich, Fortschritt aus gemeldeten Runden, Serie', function (): void {
    $app = new TestApp();
    $lea = $app->signedIn('lea@example.org', 'ein sicheres Passwort', 'Lea');
    same(401, $app->get('account/daily')->status, 'nur angemeldet');

    $before = $app->get('account/daily', $lea['cookies']);
    same(200, $before->status);
    same(3, count($before->body['tasks']));
    same(3, count(array_unique(array_column($before->body['tasks'], 'id'))));
    check(!array_filter($before->body['tasks'], static fn (array $t): bool => $t['done']), 'am Anfang nichts erledigt');
    check(!(in_array('rounds3', array_column($before->body['tasks'], 'id'), true) && in_array('rounds10', array_column($before->body['tasks'], 'id'), true)));
    $activity = new Activity($app->pdo, new BensGames\Clock(fn (): int => $app->time));
    same(array_column($before->body['tasks'], 'id'), $activity->tasksFor($before->body['day']), 'für alle gleich');

    playEverything($app, $lea);
    $after = $app->get('account/daily', $lea['cookies'])->body;
    same([true, true, true], array_column($after['tasks'], 'done'));
    same(1, $after['streak']);
    $app->get('account/daily', $lea['cookies']);
    $sums = $app->pdo->query("SELECT tasks_done, task_days FROM users WHERE display_name = 'Lea'")->fetch();
    same([3, 1], [(int) $sums['tasks_done'], (int) $sums['task_days']], 'nur einmal gezählt');

    $app->time += 86400;
    $next = $app->get('account/daily', $lea['cookies'])->body;
    check($next['day'] !== $after['day'], 'neuer Tag');
    same(1, $next['streak'], 'gestern zählt noch, solange heute offen ist');
    playEverything($app, $lea);
    same(2, $app->get('account/daily', $lea['cookies'])->body['streak']);
    $app->time += 3 * 86400;
    same(0, $app->get('account/daily', $lea['cookies'])->body['streak'], 'Serie gerissen');

    same(10, Activity::rankPoints(3, 1));
    same(600, Activity::rankPoints(1000, 1000), 'gedeckelt');
});

dbTest('Ticker: neuer Rekord, neue Erfolge, neues Level – ohne Konten mit Widerspruch', function (): void {
    $app = new TestApp();
    $lea = $app->signedIn('lea@example.org', 'ein sicheres Passwort', 'Lea');
    $max = $app->signedIn('max@example.org', 'ein sicheres Passwort', 'Max');
    $app->postAs($lea, 'games/royal-blocks/scores', ['board' => 'standard', 'score' => 5000]);
    $app->time += 5;
    $app->postAs($max, 'games/royal-blocks/scores', ['board' => 'standard', 'score' => 4000]); // kein Rekord
    $app->time += 5;
    $app->postAs($lea, 'games/royal-blocks/save/put', ['data' => json_encode(['version' => 1, 't' => 1, 'values' => []]), 't' => 1, 'achievements' => ['a', 'b']]);

    $events = $app->get('feed')->body['events'];
    same(['achievements', 'record'], array_column($events, 'kind'));
    same(['Lea', 'Lea'], array_column($events, 'display_name'));
    same(2, $events[0]['amount']);
    same(5000, $events[1]['score']);
    same('Royal Blocks', $events[1]['app_name']);
    check(!isset($events[0]['user_id']) && !isset($events[0]['email']), 'keine internen Daten');

    // Max überholt: neuer Rekord
    $app->time += 5;
    $app->postAs($max, 'games/royal-blocks/scores', ['board' => 'standard', 'score' => 9000]);
    same('Max', $app->get('feed')->body['events'][0]['display_name']);

    // Widerspruch gegen Ranglisten blendet auch den Ticker aus
    same(200, $app->postAs($max, 'account/leaderboard/settings', ['opt_out' => true])->status);
    check(!in_array('Max', array_column($app->get('feed')->body['events'], 'display_name'), true));
});

dbTest('Ruhmeshalle: abgelaufene Woche wird gesichert, Pokal und Titel im Profil, Aufräumen nach Fristen', function (): void {
    $app = new TestApp();
    $lea = $app->signedIn('lea@example.org', 'ein sicheres Passwort', 'Lea');
    $max = $app->signedIn('max@example.org', 'ein sicheres Passwort', 'Max');
    $app->postAs($lea, 'games/nova-bastion/scores', ['board' => 'endlos', 'score' => 40]);
    $app->postAs($max, 'games/nova-bastion/scores', ['board' => 'endlos', 'score' => 25]);

    same(0, activityCleanup($app)->body['deleted']['hall_weeks_archived'], 'laufende Woche noch nicht');
    $app->time += 7 * 86400;
    same(1, activityCleanup($app)->body['deleted']['hall_weeks_archived']);
    same(0, activityCleanup($app)->body['deleted']['hall_weeks_archived'], 'nur einmal');

    $hall = $app->get('halloffame')->body['weeks'];
    same(1, count($hall));
    same(['Lea', 'Max'], array_column($hall[0]['entries'], 'display_name'));
    same([1, 2], array_column($hall[0]['entries'], 'place'));
    same('weekwin', $app->get('feed')->body['events'][0]['kind']);

    $profile = siteGet($app, 'players/profile', ['name' => 'Lea'])->body['profile'];
    same(1, $profile['stats']['week_wins']);
    same('endlos', $profile['trophies'][0]['board']);
    $options = $app->get('account/profile-style', $lea['cookies']);
    same(true, array_column($options->body['titles'], 'unlocked', 'id')['wochensieger']);

    // Fristen: Tagesaktivität 40 Tage, Ticker 30 Tage; die Ruhmeshalle bleibt
    $app->time += 41 * 86400;
    $deleted = activityCleanup($app)->body['deleted'];
    check($deleted['daily_activity'] >= 2, 'alte Tagesaktivität gelöscht');
    check($deleted['feed_events'] >= 1, 'alter Ticker gelöscht');
    same(1, count($app->get('halloffame')->body['weeks']), 'Ruhmeshalle bleibt');
});
