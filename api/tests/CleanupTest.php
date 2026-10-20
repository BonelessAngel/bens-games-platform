<?php
// Tägliches Aufräumen nach den Fristen der Datenschutzerklärung (Phase 3.6).

declare(strict_types=1);

use BensGames\Api;
use BensGames\Request;

function cleanup(TestApp $app, string $token = TEST_MIGRATION_TOKEN): BensGames\Response
{
    return $app->api->handle(new Request('POST', 'admin/cleanup', ['x-maintenance-token' => $token]));
}

dbTest('Aufräumen nur mit Schlüssel', function (): void {
    $app = new TestApp();
    same(403, $app->api->handle(new Request('POST', 'admin/cleanup'))->status);
    same(403, cleanup($app, 'falsch')->status);
    same(200, cleanup($app)->status);
});

dbTest('eigener Wartungsschlüssel wird ebenfalls akzeptiert', function (): void {
    $pdo = BensGames\Database::connect(validConfig()['db']);
    $api = new Api(validConfig(['maintenance_token' => str_repeat('m', 40)]), fn (): PDO => $pdo, migrationsDir());
    same(200, $api->handle(new Request('POST', 'admin/migrate', ['x-migration-token' => TEST_MIGRATION_TOKEN]))->status);
    same(200, $api->handle(new Request('POST', 'admin/cleanup', ['x-maintenance-token' => str_repeat('m', 40)]))->status);
    same(403, $api->handle(new Request('POST', 'admin/migrate', ['x-migration-token' => str_repeat('m', 40)]))->status, 'Wartungsschlüssel darf nicht migrieren');
});

dbTest('Fristen: Protokoll 90 Tage, unbestätigte Konten 7 Tage, alte Sitzungen und Links', function (): void {
    $app = new TestApp();
    $app->signedIn('aktiv@example.org', 'ein sicheres Passwort', 'Aktiv');
    $app->post('auth/register', ['email' => 'nie@example.org', 'display_name' => 'Nie', 'password' => 'ein sicheres Passwort']);
    $ended = $app->login('aktiv@example.org');
    same(200, $app->postAs($ended, 'auth/logout')->status);

    $app->time += 6 * 86400;
    $deleted = cleanup($app)->body['deleted'];
    same(0, $deleted['users_unverified'], 'nach 6 Tagen noch da');
    same(0, $deleted['audit_log']);

    $app->time += 2 * 86400;
    $deleted = cleanup($app)->body['deleted'];
    same(1, $deleted['users_unverified'], 'unbestätigtes Konto nach 8 Tagen');
    same(1, $deleted['sessions'], 'abgemeldete Sitzung');
    check($deleted['email_tokens'] >= 1, 'verbrauchter Bestätigungslink');
    same(['Aktiv'], $app->pdo->query('SELECT display_name FROM users')->fetchAll(PDO::FETCH_COLUMN), 'bestätigtes Konto bleibt');

    $app->time += 83 * 86400;
    $deleted = cleanup($app)->body['deleted'];
    check($deleted['audit_log'] > 0, 'Protokoll nach 91 Tagen');
    $oldest = $app->pdo->query('SELECT MIN(created_at) FROM audit_log')->fetchColumn();
    check($oldest === null || $oldest >= gmdate('Y-m-d H:i:s', $app->time - 90 * 86400), 'Einträge älter als 90 Tage übrig');
});
