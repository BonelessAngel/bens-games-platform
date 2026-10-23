<?php
// Community (Phase 6): Ankündigungen, Weiterspielen, öffentliche Spielerprofile.

declare(strict_types=1);

use BensGames\Request;

function siteGet(TestApp $app, string $path, array $query = [], array $cookies = []): BensGames\Response
{
    return $app->api->handle(new Request('GET', $path, [], '', $cookies, '203.0.113.7', $query));
}

dbTest('Ankündigungen: nur mit Recht verwalten, Zielgruppe und Zeitraum gelten', function (): void {
    $app = new TestApp();
    $ownerSecret = accountWith2fa($app, 'owner@example.org', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    $owner = adminLogin($app, 'owner@example.org', $ownerSecret);
    $modSecret = accountWith2fa($app, 'mod@example.org', 'Mona');
    $app->grantRole('mod@example.org', 'moderator');
    $mod = adminLogin($app, 'mod@example.org', $modSecret);

    same(403, $app->adminGet('admin/announcements', $mod)->status, 'Moderator ohne Recht');
    same(403, $app->adminPost('admin/announcements/save', ['title' => 'x'], $mod)->status);
    same(404, $app->api->handle(new Request('GET', 'admin/announcements'))->status, 'nicht auf der Webseite');

    $invalid = $app->adminPost('admin/announcements/save', ['title' => '', 'link' => 'javascript:alert(1)', 'level' => 'rot', 'audience' => 'app', 'app_id' => 'gibt-es-nicht'], $owner);
    same(422, $invalid->status);
    same(['title', 'link', 'level', 'app_id'], array_keys($invalid->body['fields']));
    same(422, $app->adminPost('admin/announcements/save', ['title' => 'Link', 'link' => '//fremd.example'], $owner)->status, 'protokollrelativer Link');

    $now = gmdate('Y-m-d H:i:s', $app->time);
    same(200, $app->adminPost('admin/announcements/save', ['title' => 'Für alle', 'body' => 'Neues Level!', 'link' => '/ranglisten/'], $owner)->status);
    same(200, $app->adminPost('admin/announcements/save', ['title' => 'Nur Konten', 'audience' => 'signed_in'], $owner)->status);
    same(200, $app->adminPost('admin/announcements/save', ['title' => 'Nur Nova', 'audience' => 'app', 'app_id' => 'nova-bastion', 'level' => 'warning'], $owner)->status);
    same(200, $app->adminPost('admin/announcements/save', ['title' => 'Später', 'starts_at' => gmdate('Y-m-d\TH:i:s\Z', $app->time + 3600)], $owner)->status);
    $ended = $app->adminPost('admin/announcements/save', ['title' => 'Vorbei', 'starts_at' => $now, 'ends_at' => gmdate('Y-m-d H:i:s', $app->time + 60)], $owner);
    same(200, $ended->status);
    same(422, $app->adminPost('admin/announcements/save', ['title' => 'Falsch', 'starts_at' => $now, 'ends_at' => $now], $owner)->status, 'Ende vor Beginn');
    $app->time += 120;

    $titles = fn (array $query = [], array $cookies = []): array => array_column(siteGet($app, 'announcements', $query, $cookies)->body['announcements'], 'title');
    same(['Für alle'], $titles(), 'Gast');
    same(['Nur Nova', 'Für alle'], $titles(['app' => 'nova-bastion']), 'Gast im Spiel');
    same(['Für alle'], $titles(['app' => 'royal-blocks']));
    $site = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    same(['Nur Konten', 'Für alle'], $titles([], $site['cookies']), 'angemeldet');
    check(!isset(siteGet($app, 'announcements')->body['announcements'][0]['created_by']), 'Autor nicht öffentlich');

    $list = $app->adminGet('admin/announcements', $owner)->body['announcements'];
    same(['planned', 'ended'], array_values(array_intersect_key(array_column($list, 'state', 'title'), ['Später' => 1, 'Vorbei' => 1])));
    $id = $list[0]['id'];
    same(200, $app->adminPost('admin/announcements/save', ['id' => $id, 'title' => 'Geändert'], $owner)->status);
    same(200, $app->adminPost('admin/announcements/delete', ['id' => $id], $owner)->status);
    same(404, $app->adminPost('admin/announcements/delete', ['id' => $id], $owner)->status);
    same(1, (int) $app->pdo->query("SELECT COUNT(*) FROM audit_log WHERE action = 'admin.announcement_deleted'")->fetchColumn());

    // Das Recht lässt sich einzeln vergeben und öffnet die Zentrale.
    $adminSecret = accountWith2fa($app, 'helfer@example.org', 'Helfer');
    same(200, $app->adminPost('admin/rights/set', ['id' => $app->userId('helfer@example.org'), 'roles' => [], 'permissions' => ['announcements.manage']], $owner)->status);
    same(200, $app->adminGet('admin/announcements', adminLogin($app, 'helfer@example.org', $adminSecret))->status);
});

dbTest('Weiterspielen: zuletzt gespielte sichtbare Spiele mit Bestwert', function (): void {
    $app = new TestApp();
    same(401, siteGet($app, 'account/recent')->status);
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    same([], siteGet($app, 'account/recent', [], $anna['cookies'])->body['games']);

    $app->postAs($anna, 'games/nova-bastion/save/put', ['data' => '{}', 't' => 1]);
    $app->time += 60;
    $app->postAs($anna, 'games/royal-blocks/save/put', ['data' => '{}', 't' => 1]);
    $app->postAs($anna, 'games/royal-blocks/scores', ['board' => 'klassisch', 'score' => 1200]);
    $games = siteGet($app, 'account/recent', [], $anna['cookies'])->body['games'];
    same(['royal-blocks', 'nova-bastion'], array_column($games, 'id'));
    same(['board' => 'klassisch', 'score' => 1200], $games[0]['best']);
    same(null, $games[1]['best']);

    $app->pdo->exec("UPDATE apps SET status = 'private' WHERE id = 'nova-bastion'");
    same(['royal-blocks'], array_column(siteGet($app, 'account/recent', [], $anna['cookies'])->body['games'], 'id'), 'private App ohne Freigabe');
});

dbTest('Spielerprofil: öffentlich nur mit Ranglisten-Teilnahme, ohne private Daten', function (): void {
    $app = new TestApp();
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $max = $app->signedIn('max@example.org', 'ein sicheres Passwort', 'Max');
    $app->postAs($anna, 'games/nova-bastion/scores', ['board' => '2', 'score' => 300]);
    $app->postAs($anna, 'games/nova-bastion/scores', ['board' => '10', 'score' => 50]);
    $app->postAs($max, 'games/nova-bastion/scores', ['board' => '2', 'score' => 900]);
    $app->postAs($anna, 'games/nova-bastion/save/put', ['data' => '{}', 't' => 1, 'achievements' => ['stars30']]);

    same(404, siteGet($app, 'players/profile', ['name' => 'Niemand'])->status);
    same(404, siteGet($app, 'players/profile')->status);
    $profile = siteGet($app, 'players/profile', ['name' => 'anna'])->body['profile'];
    same('Anna', $profile['display_name'], 'Groß-/Kleinschreibung egal');
    same(gmdate('Y-m', $app->time), $profile['member_since']);
    same(false, $profile['me']);
    same(['2', '10'], array_column($profile['games'][0]['boards'], 'board'));
    same([2, 1], array_column($profile['games'][0]['boards'], 'rank'));
    same(['stars30'], $profile['games'][0]['achievements']);
    $json = json_encode($profile);
    check(!str_contains($json, 'example.org') && !str_contains($json, '"id":' . $app->userId('anna@example.org') . ','), 'private Daten im Profil');
    same(true, siteGet($app, 'players/profile', ['name' => 'Anna'], $anna['cookies'])->body['profile']['me']);

    // Ausgeblendete Einträge zählen nicht; Widerspruch oder Sperre → kein Profil.
    $app->pdo->exec("UPDATE leaderboard_entries SET hidden_at = NOW() WHERE board = '10'");
    same(['2'], array_column(siteGet($app, 'players/profile', ['name' => 'Anna'])->body['profile']['games'][0]['boards'], 'board'));
    same(200, $app->postAs($anna, 'account/leaderboard/settings', ['opt_out' => true])->status);
    same(404, siteGet($app, 'players/profile', ['name' => 'Anna'])->status);
    $app->pdo->exec("UPDATE users SET status = 'locked' WHERE display_name = 'Max'");
    same(404, siteGet($app, 'players/profile', ['name' => 'Max'])->status);
});

dbTest('Startbildschirm: alles für das Spiel in einer Anfrage', function (): void {
    $app = new TestApp();
    same(404, siteGet($app, 'games/gibt-es-nicht/hub')->status);
    $guest = siteGet($app, 'games/nova-bastion/hub');
    same(200, $guest->status);
    same(null, $guest->body['user']);
    same([], $guest->body['best']);
    same('/konto/anmelden/?zurueck=%2Fgames%2Fnova-bastion%2F', $guest->body['links']['login']);
    same('/ranglisten/?spiel=nova-bastion', $guest->body['links']['rankings']);

    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $max = $app->signedIn('max@example.org', 'ein sicheres Passwort', 'Max');
    $app->postAs($max, 'games/nova-bastion/scores', ['board' => '1', 'score' => 900]);
    foreach ([['1', 500], ['2', 300], ['3', 200], ['4', 100]] as [$board, $score]) {
        $app->postAs($anna, 'games/nova-bastion/scores', ['board' => $board, 'score' => $score]);
    }
    $app->postAs($anna, 'games/royal-blocks/scores', ['board' => 'klassisch', 'score' => 99999]);
    same(200, $app->postAs($anna, 'account/profile', ['avatar' => 'fox', 'avatar_color' => 'amber'])->status);

    $hub = siteGet($app, 'games/nova-bastion/hub', [], $anna['cookies'])->body;
    same('Anna', $hub['user']['display_name']);
    same('A', $hub['user']['initial']);
    same('/avatars/fox-amber.svg', $hub['user']['avatar_url']);
    same('/spieler/?name=Anna', $hub['user']['profile_url']);
    same(3, count($hub['best']), 'höchstens drei');
    same([1, 1, 1], array_column($hub['best'], 'rank'));
    same(['2', '3', '4'], array_column($hub['best'], 'board'), 'Platz 1 zuerst, Level 1 ist nur Platz 2');
    check(!str_contains(json_encode($hub), 'example.org'), 'keine E-Mail im Startbildschirm');

    same(200, $app->postAs($anna, 'account/leaderboard/settings', ['opt_out' => true])->status);
    $hidden = siteGet($app, 'games/nova-bastion/hub', [], $anna['cookies'])->body;
    same(null, $hidden['user']['profile_url']);
    same(false, $hidden['user']['listed']);
    same([null, null, null], array_column($hidden['best'], 'rank'));

    // Dev-Modus im Spiel nur mit app.<id>.manage oder als Besitzer
    same(false, $hub['user']['dev']);
    $app->pdo->prepare('INSERT INTO user_permissions (user_id, permission, granted_at) VALUES (?, ?, NOW())')->execute([$app->userId('anna@example.org'), 'app.nova-bastion.manage']);
    same(true, siteGet($app, 'games/nova-bastion/hub', [], $anna['cookies'])->body['user']['dev']);
    same(false, siteGet($app, 'games/royal-blocks/hub', [], $anna['cookies'])->body['user']['dev'], 'nur für dieses Spiel');
    $app->grantRole('max@example.org', 'owner');
    same(true, siteGet($app, 'games/royal-blocks/hub', [], $max['cookies'])->body['user']['dev'], 'Besitzer');
});
