<?php
// Ausbau der Zentrale: Fehlermeldungen, Spielstand-Hilfe, Spieler-Trichter, Trends, Technik-Übersicht, eigene Sitzungen.

declare(strict_types=1);

use BensGames\ClientErrors;
use BensGames\Request;

/** Besitzer mit 2FA anlegen und in der Zentrale anmelden. */
function ownerInPanel(TestApp $app): array
{
    $secret = accountWith2fa($app, 'owner@example.org', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    return adminLogin($app, 'owner@example.org', $secret);
}

test('Fehlermeldungen werden von persönlichen Angaben bereinigt', function (): void {
    same('Fehler in /games/nova-bastion/ bei [E-Mail] #', ClientErrors::clean('Fehler in https://bens-games.de/games/nova-bastion/?token=geheim#x bei max@example.org 12345678', 300, false));
    same('/x.js', ClientErrors::clean('chrome-extension://abcdef/x.js?y=1', 300, false));
    same("a\nb", ClientErrors::clean("a\r\n  b", 300, true));
    same('Chrome · Android', ClientErrors::browser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'));
    same('Safari · iOS', ClientErrors::browser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'));
    same(null, ClientErrors::browser(''));
});

dbTest('Fehlermeldungen: anonym melden, in der Zentrale gruppiert sehen und erledigen', function (): void {
    $app = new TestApp();
    same(404, $app->post('errors', ['app' => 'gibt-es-nicht', 'message' => 'x'])->status, 'unbekanntes Spiel');
    same(422, $app->post('errors', ['app' => 'nova-bastion', 'message' => '   '])->status, 'leere Meldung');
    same(403, $app->post('errors', ['app' => 'nova-bastion', 'message' => 'x'], ['origin' => 'https://fremd.example'])->status, 'fremde Herkunft');
    for ($i = 0; $i < 3; $i++) {
        same(202, $app->post('errors', ['app' => 'nova-bastion', 'message' => "Cannot read properties of null (reading 'x$i')", 'source' => 'https://bens-games.de/games/nova-bastion/?a=1', 'line' => 120, 'col' => 4, 'stack' => "at f (https://bens-games.de/games/nova-bastion/:120:4)\nat g"])->status);
    }
    same(202, $app->post('errors', ['app' => 'nova-bastion', 'message' => 'ganz anderer Fehler'])->status);
    $row = $app->pdo->query('SELECT * FROM client_errors ORDER BY id LIMIT 1')->fetch();
    same('/games/nova-bastion/:120:4', $row['source'], 'nur Pfad, Zeile und Spalte');
    check(!str_contains((string) $row['stack'], 'bens-games.de'), 'keine Domain im Aufrufpfad');
    same(0, (int) $app->pdo->query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'client_errors' AND column_name IN ('user_id', 'ip', 'ip_prefix')")->fetchColumn(), 'weder Konto noch IP');

    same(404, $app->get('admin/errors')->status, 'nicht auf der Webseite');
    $admin = ownerInPanel($app);
    $list = $app->adminGet('admin/errors', $admin, ['app' => 'nova-bastion']);
    same(200, $list->status);
    same(2, count($list->body['groups']), 'gleiche Fehler (nur Zahl anders) bilden eine Gruppe');
    $group = array_values(array_filter($list->body['groups'], static fn (array $g): bool => $g['count'] === 3))[0];
    same(false, $group['resolved']);

    same(200, $app->adminPost('admin/errors/resolve', ['app_id' => 'nova-bastion', 'fingerprint' => $group['fingerprint'], 'resolved' => true], $admin)->status);
    $after = $app->adminGet('admin/errors', $admin, ['app' => 'nova-bastion'])->body['groups'];
    same(true, array_values(array_filter($after, static fn (array $g): bool => $g['fingerprint'] === $group['fingerprint']))[0]['resolved']);

    // Tritt der Fehler danach erneut auf, ist er wieder offen.
    $app->time += 60;
    $app->post('errors', ['app' => 'nova-bastion', 'message' => "Cannot read properties of null (reading 'x9')", 'source' => '/games/nova-bastion/', 'line' => 120, 'col' => 4]);
    $again = $app->adminGet('admin/errors', $admin, ['app' => 'nova-bastion'])->body['groups'];
    same(false, array_values(array_filter($again, static fn (array $g): bool => $g['fingerprint'] === $group['fingerprint']))[0]['resolved'], 'wieder aufgetreten');
});

dbTest('Spielstand-Hilfe: Verlauf entsteht beim Überschreiben, Wiederherstellen nur mit Bestätigung', function (): void {
    $app = new TestApp();
    $admin = ownerInPanel($app);
    $player = $app->signedIn('spieler@example.org', 'ein sicheres Passwort', 'Spieler');
    $put = fn (int $stars, int $t) => $app->postAs($player, 'games/nova-bastion/save/put', ['data' => json_encode(['camp' => ['stars' => [$stars, 0], 'crystals' => 10 * $stars, 'xp' => 0]]), 't' => $t]);

    same(200, $put(1, 1000)->status);
    same(200, $put(2, 2000)->status, 'zweiter Stand');
    $app->time += 3600;
    same(200, $put(3, 3000)->status, 'innerhalb von 6 Stunden kein weiterer Verlaufseintrag');
    same(1, (int) $app->pdo->query('SELECT COUNT(*) FROM game_save_history')->fetchColumn());

    $id = $app->userId('spieler@example.org');
    $saves = $app->adminGet('admin/saves', $admin, ['id' => (string) $id]);
    same(200, $saves->status);
    $nova = $saves->body['games'][0];
    same('nova-bastion', $nova['app_id']);
    same('1 Einsätze geschafft · 3 Sterne · 30 Kristalle · 0 XP', $nova['current']['summary']);
    same('1 Einsätze geschafft · 1 Sterne · 10 Kristalle · 0 XP', $nova['history'][0]['summary']);

    $historyId = $nova['history'][0]['id'];
    same(422, $app->adminPost('admin/saves/restore', ['id' => $id, 'history_id' => $historyId], $admin)->status, 'ohne Bestätigung');
    same(403, $app->adminPost('admin/saves/restore', ['id' => $app->userId('owner@example.org'), 'history_id' => $historyId, 'confirm' => 'WIEDERHERSTELLEN'], $admin)->status, 'nicht beim eigenen Konto');
    $restored = $app->adminPost('admin/saves/restore', ['id' => $id, 'history_id' => $historyId, 'confirm' => 'WIEDERHERSTELLEN'], $admin);
    same(200, $restored->status);

    $now = $app->get('games/nova-bastion/save', $player['cookies'])->body['save'];
    same(1, json_decode($now['data'], true)['camp']['stars'][0], 'alter Stand ist wieder da');
    check($now['t'] > 3000, 'neuer Zeitstempel, damit alle Geräte ihn übernehmen');
    same(409, $put(5, 4000)->status, 'ein Gerät mit altem Stand bekommt den wiederhergestellten');
    same(1, (int) $app->pdo->query("SELECT COUNT(*) FROM audit_log WHERE action = 'admin.save_restored'")->fetchColumn(), 'im Protokoll');
    same(1, (int) $app->pdo->query("SELECT COUNT(*) FROM game_save_history WHERE reason = 'before_restore'")->fetchColumn(), 'Stand vor dem Wiederherstellen gesichert');

    same(200, $app->postAs($player, 'games/nova-bastion/save/delete')->status);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM game_save_history')->fetchColumn(), 'Löschen entfernt auch den Verlauf');
});

dbTest('Spieler-Trichter zählt Spieler je nummeriertem Level', function (): void {
    $app = new TestApp();
    $admin = ownerInPanel($app);
    $insert = $app->pdo->prepare("INSERT INTO game_events (created_at, app_id, user_id, visit, type, level, result) VALUES (?, 'nova-bastion', NULL, ?, ?, ?, ?)");
    $at = gmdate('Y-m-d H:i:s', $app->time - 3600);
    foreach (['a', 'b', 'c', 'd'] as $visit) {
        $insert->execute([$at, str_repeat($visit, 16), 'level_start', '1', null]);
        $insert->execute([$at, str_repeat($visit, 16), 'level_end', '1', 'win']);
    }
    foreach (['a', 'b'] as $visit) {
        $insert->execute([$at, str_repeat($visit, 16), 'level_start', '2', null]);
    }
    $insert->execute([$at, str_repeat('a', 16), 'level_end', '2', 'win']);
    $insert->execute([$at, str_repeat('a', 16), 'level_start', 'endlos', null]);

    $funnel = $app->adminGet('admin/funnel', $admin, ['app' => 'nova-bastion']);
    same(200, $funnel->status);
    same([1, 2], array_column($funnel->body['steps'], 'level'), 'nur nummerierte Level');
    same(4, $funnel->body['steps'][0]['players']);
    same(2, $funnel->body['steps'][1]['players']);
    same(1, $funnel->body['steps'][1]['winners']);
    same(0.5, $funnel->body['steps'][1]['drop']);
});

dbTest('Übersicht mit Trends, Technik-Übersicht und eigene Sitzungen', function (): void {
    $app = new TestApp();
    $admin = ownerInPanel($app);
    $overview = $app->adminGet('admin/overview', $admin)->body;
    foreach (['players', 'visits', 'seconds', 'new_users', 'wins'] as $key) {
        check(isset($overview['trends'][$key]['now'], $overview['trends'][$key]['before']), "Trend $key fehlt");
    }
    same(1, $overview['trends']['new_users']['now'], 'das Konto des Besitzers');

    $system = $app->adminGet('admin/system', $admin);
    same(200, $system->status);
    $migrations = glob(migrationsDir() . '/*.sql');
    same(basename((string) end($migrations), '.sql'), $system->body['schema'], 'neuester Datenbank-Stand');
    same([], $system->body['pending_migrations']);
    check(in_array('nova-bastion', array_column($system->body['apps'], 'id'), true), 'Spiele mit Version');
    check(in_array('client_errors', array_column($system->body['tables'], 'name'), true), 'Tabellen-Größen');

    $sessions = $app->adminGet('admin/sessions', $admin);
    same(200, $sessions->status);
    same(1, count(array_filter($sessions->body['sessions'], static fn (array $s): bool => $s['current'])), 'aktuelle Sitzung markiert');
    same(200, $app->adminPost('admin/sessions/revoke-others', [], $admin)->status);
});

dbTest('Aufräumen löscht alte Fehlermeldungen (90 Tage) und alte Spielstand-Verläufe (30 Tage)', function (): void {
    $app = new TestApp();
    $app->post('errors', ['app' => 'nova-bastion', 'message' => 'alt']);
    $player = $app->signedIn();
    $app->postAs($player, 'games/nova-bastion/save/put', ['data' => '{"a":1}', 't' => 1]);
    $app->postAs($player, 'games/nova-bastion/save/put', ['data' => '{"a":2}', 't' => 2]);
    same(1, (int) $app->pdo->query('SELECT COUNT(*) FROM game_save_history')->fetchColumn());
    $app->time += 31 * 86400;
    $deleted = cleanup($app)->body['deleted'];
    same(1, $deleted['game_save_history'] ?? null, 'Verlauf nach 30 Tagen');
    same(0, $deleted['client_errors'] ?? null, 'Fehler nach 31 Tagen noch da');
    $app->time += 60 * 86400;
    $deleted = cleanup($app)->body['deleted'];
    same(1, $deleted['client_errors'] ?? null, 'Fehler nach 91 Tagen');
});
