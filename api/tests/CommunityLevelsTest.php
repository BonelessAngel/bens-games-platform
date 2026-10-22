<?php
// Community-Level und veröffentlichte Spielinhalte (Kampagne) – Phase 6.

declare(strict_types=1);

use BensGames\NovaBastionLevel;
use BensGames\Request;

function sampleLevel(array $overrides = []): array
{
    return $overrides + [
        'name' => 'Mein <b>Level</b>',
        'paths' => [[[4, 135], [150, 135], [150, 70], [450, 200]]],
        'spots' => [[100, 100, 'high', ['only' => ['laser', 'X!'], 'pre' => 'laser', 'pt' => 9]], ['kaputt']],
        'diff' => ['hp' => 99, 'waves' => 3, 'gold' => '1.5', 'lives' => 0, 'spd' => 1.2],
        'boss' => 'classic',
        'focus' => 'air',
        'obj' => 'hacken',
        'msg' => "Hallo\n<script>",
        'rules' => ['fog', 'BÖSE'],
        'waveOv' => ['0' => [['grunt', 5]], '3' => [['tank', 500]]],
        'deco' => [[10, 10, 'rock'], [10, 10, '<x>']],
        'gefährlich' => 'weg',
    ];
}

test('Nova-Bastion-Level: nur bekannte Felder, Werte begrenzt, Texte bereinigt', function (): void {
    $lv = NovaBastionLevel::sanitize(sampleLevel());
    same('Mein bLevel/b', $lv['name']);
    same([[100, 100, 'high', ['only' => ['laser'], 'pre' => 'laser', 'pt' => 3]]], $lv['spots']);
    same(5, $lv['diff']['hp']);
    same(1.5, $lv['diff']['gold']);
    same(null, $lv['obj']);
    same('air', $lv['focus']);
    same('Hallo script', $lv['msg']);
    same(['fog'], $lv['rules']);
    same([[10, 10, 'rock']], $lv['deco']);
    same('{"0":[["grunt",5]],"3":[["tank",200]]}', json_encode($lv['waveOv']), 'als Objekt');
    check(!array_key_exists('gefährlich', $lv), 'unbekanntes Feld übernommen');
    same(null, NovaBastionLevel::sanitize(['paths' => []]));
    same(null, NovaBastionLevel::sanitize(['paths' => [[[0, 0]]]]), 'Weg mit nur einem Punkt');
    same(null, NovaBastionLevel::sanitize('kein Level'));
});

dbTest('Community-Level: hochladen nur mit Konto, Grenzen, Liste und Abruf', function (): void {
    $app = new TestApp();
    same(401, $app->post('games/nova-bastion/levels/upload', ['level' => sampleLevel()])->status);
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    same(404, $app->postAs($anna, 'games/royal-blocks/levels/upload', ['level' => sampleLevel()])->status, 'Spiel ohne Community-Level');
    same(422, $app->postAs($anna, 'games/nova-bastion/levels/upload', ['level' => ['paths' => 'x']])->status);
    same(413, $app->postAs($anna, 'games/nova-bastion/levels/upload', ['level' => sampleLevel(['msg' => str_repeat('x', 70000)])])->status);

    $up = $app->postAs($anna, 'games/nova-bastion/levels/upload', ['level' => sampleLevel(), 'star' => 4, 'boss' => true, 'style' => 'lava']);
    same(200, $up->status);
    same(429, $app->postAs($anna, 'games/nova-bastion/levels/upload', ['level' => sampleLevel()])->status, 'eine Minute warten');

    $list = siteGet($app, 'games/nova-bastion/levels')->body['levels'];
    same(1, count($list));
    same('Anna', $list[0]['author']);
    same([4, true, 'lava', 1, 'air'], [$list[0]['star'], $list[0]['boss'], $list[0]['style'], $list[0]['np'], $list[0]['focus']]);
    same(false, $list[0]['mine'], 'ohne Anmeldung');
    same(true, siteGet($app, 'games/nova-bastion/levels', [], $anna['cookies'])->body['levels'][0]['mine']);
    check(!str_contains(json_encode($list), 'example.org'), 'E-Mail in der Liste');

    $one = siteGet($app, 'games/nova-bastion/levels/get', ['id' => (string) $up->body['id']]);
    same(200, $one->status);
    same('Mein bLevel/b', $one->body['level']->name ?? $one->body['level']['name'] ?? null);
    same(404, siteGet($app, 'games/nova-bastion/levels/get', ['id' => '999'])->status);

    for ($i = 1; $i < 15; $i++) {
        $app->time += 61;
        same(200, $app->postAs($anna, 'games/nova-bastion/levels/upload', ['level' => sampleLevel()])->status, "Level $i");
    }
    $app->time += 61;
    $limit = $app->postAs($anna, 'games/nova-bastion/levels/upload', ['level' => sampleLevel()]);
    same(429, $limit->status);
    same('limit', $limit->body['error']);
});

dbTest('Community-Level: Daumen, Ergebnisse, Bestenliste, löschen', function (): void {
    $app = new TestApp();
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $max = $app->signedIn('max@example.org', 'ein sicheres Passwort', 'Max');
    $id = $app->postAs($anna, 'games/nova-bastion/levels/upload', ['level' => sampleLevel()])->body['id'];

    same(422, $app->postAs($anna, 'games/nova-bastion/levels/like', ['id' => $id])->status, 'eigenes Level');
    $like = $app->postAs($max, 'games/nova-bastion/levels/like', ['id' => $id]);
    same([1, true], [$like->body['likes'], $like->body['liked']]);
    same(true, siteGet($app, 'games/nova-bastion/levels', [], $max['cookies'])->body['levels'][0]['liked']);
    $unlike = $app->postAs($max, 'games/nova-bastion/levels/like', ['id' => $id]);
    same([0, false], [$unlike->body['likes'], $unlike->body['liked']]);
    $app->postAs($max, 'games/nova-bastion/levels/like', ['id' => $id]);

    same(200, $app->post('games/nova-bastion/levels/result', ['id' => $id, 'win' => false])->status, 'Gast');
    same(200, $app->post('games/nova-bastion/levels/result', ['id' => $id, 'win' => true, 'lives' => 7])->status, 'Gast gewinnt');
    $app->postAs($max, 'games/nova-bastion/levels/result', ['id' => $id, 'win' => true, 'lives' => 12]);
    $app->postAs($max, 'games/nova-bastion/levels/result', ['id' => $id, 'win' => true, 'lives' => 3]);
    $level = siteGet($app, 'games/nova-bastion/levels')->body['levels'][0];
    same([4, 3], [$level['plays'], $level['wins']]);
    same([['n' => 'Max', 'l' => 12]], $level['best'], 'Bestwert zählt, Gäste nicht');

    same(404, $app->postAs($max, 'games/nova-bastion/levels/delete', ['id' => $id])->status, 'fremdes Level');
    same(200, $app->postAs($anna, 'games/nova-bastion/levels/delete', ['id' => $id])->status);
    same([], siteGet($app, 'games/nova-bastion/levels')->body['levels']);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM community_likes')->fetchColumn(), 'Daumen mitgelöscht');
});

dbTest('Community-Level: Moderation in der Zentrale, Konto löschen entfernt Level', function (): void {
    $app = new TestApp();
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $id = $app->postAs($anna, 'games/nova-bastion/levels/upload', ['level' => sampleLevel()])->body['id'];

    $modSecret = accountWith2fa($app, 'mod@example.org', 'Mona');
    $app->grantRole('mod@example.org', 'moderator');
    $mod = adminLogin($app, 'mod@example.org', $modSecret);
    same(404, $app->api->handle(new Request('GET', 'admin/levels'))->status, 'nicht auf der Webseite');
    $list = $app->adminGet('admin/levels', $mod, ['app' => 'nova-bastion']);
    same(200, $list->status);
    same('Anna', $list->body['levels'][0]['display_name']);

    same(200, $app->adminPost('admin/levels/hide', ['id' => $id, 'hidden' => true, 'reason' => 'Test'], $mod)->status);
    same([], siteGet($app, 'games/nova-bastion/levels')->body['levels']);
    same(404, siteGet($app, 'games/nova-bastion/levels/get', ['id' => (string) $id])->status);
    same(200, $app->adminPost('admin/levels/hide', ['id' => $id, 'hidden' => false], $mod)->status);
    same(1, count(siteGet($app, 'games/nova-bastion/levels')->body['levels']));
    same(200, $app->adminPost('admin/levels/delete', ['id' => $id], $mod)->status);
    same(1, (int) $app->pdo->query("SELECT COUNT(*) FROM audit_log WHERE action = 'admin.level_deleted'")->fetchColumn());

    $app->time += 61;
    $app->postAs($anna, 'games/nova-bastion/levels/upload', ['level' => sampleLevel()]);
    same(200, $app->postAs($anna, 'account/delete', ['password' => 'ein sicheres Passwort', 'confirm' => true])->status);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM community_levels')->fetchColumn(), 'Level mit Konto gelöscht');
});

dbTest('Kampagne: lesen öffentlich, veröffentlichen nur in der Zentrale mit app.<id>.manage', function (): void {
    $app = new TestApp();
    same(['ts' => 0, 'json' => null], siteGet($app, 'games/nova-bastion/campaign')->body);
    same(404, siteGet($app, 'games/royal-blocks/campaign')->status);
    same(404, $app->post('admin/content/publish', ['app_id' => 'nova-bastion', 'key' => 'campaign', 'json' => '{}'])->status, 'nicht auf der Webseite');

    $modSecret = accountWith2fa($app, 'mod@example.org', 'Mona');
    $app->grantRole('mod@example.org', 'moderator');
    $mod = adminLogin($app, 'mod@example.org', $modSecret);
    $campaign = json_encode(['ts' => 5, 'worlds' => [['name' => 'Mond']]]);
    same(403, $app->adminPost('admin/content/publish', ['app_id' => 'nova-bastion', 'key' => 'campaign', 'json' => $campaign], $mod)->status);

    $devSecret = accountWith2fa($app, 'dev@example.org', 'Dev');
    $app->pdo->prepare('INSERT INTO user_permissions (user_id, permission, granted_at) VALUES (?, ?, NOW())')->execute([$app->userId('dev@example.org'), 'app.nova-bastion.manage']);
    $owner = adminLogin($app, 'dev@example.org', $devSecret);
    same(422, $app->adminPost('admin/content/publish', ['app_id' => 'nova-bastion', 'key' => 'campaign', 'json' => '{"worlds":[]}'], $owner)->status);
    same(404, $app->adminPost('admin/content/publish', ['app_id' => 'nova-bastion', 'key' => 'anderes', 'json' => $campaign], $owner)->status);
    $published = $app->adminPost('admin/content/publish', ['app_id' => 'nova-bastion', 'key' => 'campaign', 'json' => $campaign], $owner);
    same(200, $published->status);
    same($app->time * 1000, $published->body['ts']);

    $get = siteGet($app, 'games/nova-bastion/campaign')->body;
    same($campaign, $get['json']);
    same($app->time * 1000, $get['ts']);
    same(strlen($campaign), (int) $app->adminGet('admin/content', $owner, ['app' => 'nova-bastion', 'key' => 'campaign'])->body['content']['size']);
});
