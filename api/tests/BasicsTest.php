<?php
// Konfiguration, Migrationen und Grundverhalten der API.

declare(strict_types=1);

use BensGames\Api;
use BensGames\Config;
use BensGames\Database;
use BensGames\Migrator;
use BensGames\Request;
use BensGames\Security;

test('Konfiguration liegt neben dem Webseiten-Ordner', function (): void {
    same('/www/htdocs/w1/bens-games-staging-config/config.php', Config::defaultPath('/www/htdocs/w1/bens-games-staging/api'));
    same('/www/htdocs/w1/bens-games-live-config/config.php', Config::defaultPath('/www/htdocs/w1/bens-games-live/api'));
});

test('gültige Konfiguration wird geladen', function (): void {
    same('test', Config::load(writeConfig(validConfig()))['environment']);
});

test('fehlende oder unvollständige Konfiguration wird abgelehnt', function (): void {
    throws(fn () => Config::load('/gibt/es/nicht/config.php'), '/fehlt/');
    throws(fn () => Config::validate(validConfig(['environment' => 'live'])), '/environment/');
    throws(fn () => Config::validate(validConfig(['db' => ['password' => '']])), '/db\.password/');
    throws(fn () => Config::validate(validConfig(['migration_token' => 'kurz'])), '/migration_token/');
    throws(fn () => Config::validate(validConfig(['app_secret' => 'HIER_ZUFALLSWERT_2' . str_repeat('x', 40)])), '/app_secret/');
    throws(fn () => Config::validate(validConfig(['base_url' => 'https://bens-games.de/pfad'])), '/base_url/');
    throws(fn () => Config::validate(validConfig(['mail' => ['from' => 'kein-absender']])), '/mail\.from/');
});

test('Konfiguration der Zentrale übernimmt die der Webseite und setzt nur die Rolle', function (): void {
    $base = sys_get_temp_dir() . '/bgcfg-' . bin2hex(random_bytes(4));
    mkdir("$base/bens-games-live-config", 0777, true);
    mkdir("$base/bens-games-admin-config", 0777, true);
    file_put_contents("$base/bens-games-live-config/config.php", '<?php return ' . var_export(validConfig(['environment' => 'production', 'base_url' => null]), true) . ';');
    file_put_contents(
        "$base/bens-games-admin-config/config.php",
        "<?php\n\$config = require __DIR__ . '/../bens-games-live-config/config.php';\n\$config['role'] = 'admin';\nreturn \$config;\n"
    );
    $config = Config::load(Config::defaultPath("$base/bens-games-admin/api"));
    same('admin', Config::role($config));
    same('https://admin.bens-games.de', Config::baseUrl($config));
    same('https://bens-games.de', Config::siteUrl($config));
    same(validConfig()['app_secret'], $config['app_secret'], 'gleiche Schlüssel wie die Webseite');
});

test('die Vorlage selbst ist keine gültige Konfiguration', function (): void {
    throws(fn () => Config::load(__DIR__ . '/../config.example.php'), '/fehlt|muss/');
});

test('eigene Adresse kommt aus der Konfiguration', function (): void {
    same('https://staging.bens-games.de', Config::baseUrl(['environment' => 'staging']));
    same('https://bens-games.de', Config::baseUrl(['environment' => 'production']));
    same('https://x.example', Config::baseUrl(['environment' => 'production', 'base_url' => 'https://x.example/']));
});

test('IP-Adressen werden gekürzt', function (): void {
    same('203.0.113.0', Security::ipPrefix('203.0.113.77'));
    same('2001:db8:abcd::', Security::ipPrefix('2001:db8:abcd:12:3456::1'));
    same(null, Security::ipPrefix('keine-ip'));
});

test('SQL wird in Anweisungen zerlegt, Kommentare entfallen', function (): void {
    $sql = "-- Kommentar\nCREATE TABLE a (x INT);\n\n-- noch einer\nINSERT INTO a VALUES (1);\n";
    same(['CREATE TABLE a (x INT)', 'INSERT INTO a VALUES (1)'], Migrator::statements($sql));
});

test('alle Migrationsdateien sind korrekt benannt', function (): void {
    foreach (glob(migrationsDir() . '/*.sql') as $file) {
        check((bool) preg_match('/^\d{3}_[a-z0-9_]+\.sql$/', basename($file)), 'Name: ' . basename($file));
    }
});

test('ohne Konfiguration meldet die API einen Fehler statt Details', function (): void {
    $api = new Api(null, null, migrationsDir());
    $response = $api->handle(new Request('GET', 'health'));
    same(503, $response->status);
    same(['status' => 'error', 'error' => 'config'], $response->body);
    same(503, $api->handle(new Request('POST', 'auth/login', ['origin' => TEST_ORIGIN, 'content-type' => 'application/json'], '{}'))->status);
});

test('unbekannte Pfade und falsche Methoden', function (): void {
    $api = new Api(null, null, migrationsDir());
    same(404, $api->handle(new Request('GET', 'gibt-es-nicht'))->status);
    same(404, $api->handle(new Request('GET', 'src/Config.php'))->status);
    same(405, $api->handle(new Request('GET', 'admin/migrate'))->status);
    same(405, $api->handle(new Request('POST', 'health'))->status);
    same(405, $api->handle(new Request('GET', 'auth/login'))->status);
});

dbTest('Migrationen laufen auf leerer Datenbank genau einmal', function (): void {
    $pdo = Database::connect(validConfig()['db']);
    resetDatabase($pdo);
    $migrator = new Migrator($pdo, migrationsDir());
    $all = $migrator->available();
    check($all !== [], 'keine Migrationen gefunden');
    same($all, $migrator->pending());
    same($all, $migrator->migrate());
    same([], $migrator->pending());
    same([], $migrator->migrate(), 'zweiter Lauf');
    same(end($all), $migrator->currentVersion());
});

dbTest('Migration nur mit richtigem Schlüssel', function (): void {
    $pdo = Database::connect(validConfig()['db']);
    resetDatabase($pdo);
    $api = new Api(validConfig(), fn (): PDO => $pdo, migrationsDir());
    same(403, $api->handle(new Request('POST', 'admin/migrate'))->status);
    same(403, $api->handle(new Request('POST', 'admin/migrate', ['x-migration-token' => 'falsch']))->status);
    $ok = $api->handle(new Request('POST', 'admin/migrate', ['x-migration-token' => TEST_MIGRATION_TOKEN]));
    same(200, $ok->status);
    check($ok->body['applied'] !== [], 'nichts eingespielt');
});

dbTest('Statusabfrage mit Datenbank', function (): void {
    $pdo = Database::connect(validConfig()['db']);
    $api = new Api(validConfig(), fn (): PDO => $pdo, migrationsDir());
    $response = $api->handle(new Request('GET', 'health'));
    same(200, $response->status);
    same('ok', $response->body['database']);
    same(0, $response->body['pending_migrations']);
});

dbTest('nicht erreichbare Datenbank verrät keine Details', function (): void {
    $broken = validConfig(['db' => ['password' => 'falsch']]);
    $api = new Api($broken, static fn (): PDO => Database::connect($broken['db']), migrationsDir());
    $response = $api->handle(new Request('GET', 'health'));
    same(503, $response->status);
    same(['status' => 'error', 'error' => 'database'], $response->body);
});
