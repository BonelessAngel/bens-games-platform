<?php
// App-Verzeichnis in der Datenbank (Phase 3.5).

declare(strict_types=1);

use BensGames\AppCatalog;
use BensGames\Clock;
use BensGames\Request;

function demoApp(array $overrides = []): array
{
    return $overrides + [
        'id' => 'demo', 'name' => 'Demo', 'type' => 'tool', 'description' => 'Eine Test-App',
        'icon' => '/app-icons/demo.svg', 'path' => '/apps/demo/', 'version' => '1.0.0',
        'status' => 'public', 'visibility' => 'all',
    ];
}

function appIds(TestApp $app, array $cookies = []): array
{
    $response = $app->api->handle(new Request('GET', 'apps', [], '', $cookies, '203.0.113.7'));
    same(200, $response->status, 'App-Liste');
    $ids = array_column($response->body['apps'], 'id');
    sort($ids);
    return $ids;
}

dbTest('Deploy gleicht apps.json ab – Nova Bastion ist öffentlich sichtbar', function (): void {
    $app = new TestApp();
    $row = $app->pdo->query("SELECT * FROM apps WHERE id = 'nova-bastion'")->fetch();
    check($row !== false, 'Nova Bastion fehlt');
    same('/games/nova-bastion/', $row['path']);
    same(['nova-bastion'], appIds($app));
});

dbTest('Abgleich ändert Code-Felder, aber nie Status und Sichtbarkeit aus der Datenbank', function (): void {
    $app = new TestApp();
    $catalog = new AppCatalog($app->pdo, new Clock(fn (): int => $app->time));
    $catalog->sync([demoApp()]);
    $app->pdo->exec("UPDATE apps SET status = 'maintenance', visibility = 'signed_in' WHERE id = 'demo'");

    $catalog->sync([demoApp(['name' => 'Demo 2', 'version' => '1.1.0', 'status' => 'public', 'visibility' => 'all'])]);
    $row = $app->pdo->query("SELECT * FROM apps WHERE id = 'demo'")->fetch();
    same('Demo 2', $row['name']);
    same('1.1.0', $row['version']);
    same('maintenance', $row['status']);
    same('signed_in', $row['visibility']);

    throws(fn () => $catalog->sync([demoApp(['status' => 'geheim'])]), '/ungültig/');
});

dbTest('Sichtbarkeit: Gäste, Angemeldete, Freigaben und private Apps', function (): void {
    $app = new TestApp();
    $catalog = new AppCatalog($app->pdo, new Clock(fn (): int => $app->time));
    $catalog->sync([
        demoApp(['id' => 'offen', 'path' => '/apps/offen/']),
        demoApp(['id' => 'konto', 'path' => '/apps/konto/', 'visibility' => 'signed_in']),
        demoApp(['id' => 'auswahl', 'path' => '/apps/auswahl/', 'visibility' => 'selected', 'status' => 'beta']),
        demoApp(['id' => 'geheim', 'path' => '/apps/geheim/', 'status' => 'private']),
        demoApp(['id' => 'wartung', 'path' => '/apps/wartung/', 'status' => 'maintenance']),
    ]);

    same(['offen', 'wartung'], array_values(array_diff(appIds($app), ['nova-bastion'])), 'Gast');

    $ben = $app->signedIn();
    same(['konto', 'offen', 'wartung'], array_values(array_diff(appIds($app, $ben['cookies']), ['nova-bastion'])), 'angemeldet');

    $userId = (int) $app->pdo->query('SELECT id FROM users')->fetchColumn();
    $app->pdo->prepare('INSERT INTO app_access (user_id, app_id, created_at) VALUES (?, ?, ?)')->execute([$userId, 'auswahl', '2026-10-21 00:00:00']);
    $app->pdo->prepare('INSERT INTO app_access (user_id, app_id, created_at) VALUES (?, ?, ?)')->execute([$userId, 'geheim', '2026-10-21 00:00:00']);
    same(['auswahl', 'geheim', 'konto', 'offen', 'wartung'], array_values(array_diff(appIds($app, $ben['cookies']), ['nova-bastion'])), 'mit Freigaben');

    same(['offen', 'wartung'], array_values(array_diff(appIds($app), ['nova-bastion'])), 'Gast sieht weiterhin nichts davon');
});

dbTest('Konto löschen entfernt auch Freigaben', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    $userId = (int) $app->pdo->query('SELECT id FROM users')->fetchColumn();
    $app->pdo->prepare('INSERT INTO app_access (user_id, app_id, created_at) VALUES (?, ?, ?)')->execute([$userId, 'nova-bastion', '2026-10-21 00:00:00']);
    same(200, $app->postAs($session, 'account/delete', ['password' => 'ein sicheres Passwort', 'confirm' => true])->status);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM app_access')->fetchColumn());
});
