<?php
// Kleiner Testlauf für die API ohne Zusatzpakete: php api/tests/run.php
// Datenbank-Tests laufen, wenn TEST_DB_HOST gesetzt ist (in GitHub Actions über einen MariaDB-Container).

declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use BensGames\Api;
use BensGames\Config;
use BensGames\Database;
use BensGames\Migrator;

$tests = [];
$failures = 0;

function test(string $name, callable $fn): void
{
    $GLOBALS['tests'][] = [$name, $fn];
}

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function same(mixed $expected, mixed $actual, string $message = ''): void
{
    check($expected === $actual, $message . ' erwartet ' . var_export($expected, true) . ', erhalten ' . var_export($actual, true));
}

function throws(callable $fn, string $pattern): void
{
    try {
        $fn();
    } catch (Throwable $e) {
        check((bool) preg_match($pattern, $e->getMessage()), 'falsche Fehlermeldung: ' . $e->getMessage());
        return;
    }
    throw new RuntimeException('Fehler erwartet, aber keiner aufgetreten');
}

function validConfig(array $overrides = []): array
{
    return array_replace_recursive([
        'environment' => 'test',
        'db' => [
            'host' => getenv('TEST_DB_HOST') ?: 'localhost',
            'port' => (int) (getenv('TEST_DB_PORT') ?: 3306),
            'name' => getenv('TEST_DB_NAME') ?: 'test',
            'user' => getenv('TEST_DB_USER') ?: 'test',
            'password' => getenv('TEST_DB_PASSWORD') ?: 'test',
        ],
        'migration_token' => str_repeat('a', 48),
        'app_secret' => str_repeat('b', 64),
    ], $overrides);
}

function writeConfig(array $config): string
{
    $file = tempnam(sys_get_temp_dir(), 'bgcfg') . '.php';
    file_put_contents($file, '<?php return ' . var_export($config, true) . ';');
    return $file;
}

// --- Konfiguration ---------------------------------------------------------

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
});

test('die Vorlage selbst ist keine gültige Konfiguration', function (): void {
    throws(fn () => Config::load(__DIR__ . '/../config.example.php'), '/fehlt|muss/');
});

// --- Migrationen ohne Datenbank ---------------------------------------------

test('SQL wird in Anweisungen zerlegt, Kommentare entfallen', function (): void {
    $sql = "-- Kommentar\nCREATE TABLE a (x INT);\n\n-- noch einer\nINSERT INTO a VALUES (1);\n";
    same(['CREATE TABLE a (x INT)', 'INSERT INTO a VALUES (1)'], Migrator::statements($sql));
});

test('alle Migrationsdateien sind korrekt benannt', function (): void {
    foreach (glob(__DIR__ . '/../migrations/*.sql') as $file) {
        check((bool) preg_match('/^\d{3}_[a-z0-9_]+\.sql$/', basename($file)), 'Name: ' . basename($file));
    }
});

// --- API ohne Datenbank -----------------------------------------------------

test('ohne Konfiguration meldet die API einen Fehler statt Details', function (): void {
    $api = new Api(null, null, __DIR__ . '/../migrations');
    $response = $api->handle('GET', 'health', []);
    same(503, $response->status);
    same(['status' => 'error', 'error' => 'config'], $response->body);
});

test('unbekannte Pfade und falsche Methoden', function (): void {
    $api = new Api(null, null, __DIR__ . '/../migrations');
    same(404, $api->handle('GET', 'gibt-es-nicht', [])->status);
    same(404, $api->handle('GET', 'src/Config.php', [])->status);
    same(405, $api->handle('GET', 'admin/migrate', [])->status);
    same(405, $api->handle('POST', 'health', [])->status);
});

// --- Mit Datenbank -----------------------------------------------------------

if (getenv('TEST_DB_HOST')) {
    $connect = static fn (): PDO => Database::connect(validConfig()['db']);
    $migrations = __DIR__ . '/../migrations';

    $reset = static function () use ($connect): void {
        $pdo = $connect();
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
            $pdo->exec("DROP TABLE `$table`");
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    };

    test('Migrationen laufen auf leerer Datenbank genau einmal', function () use ($connect, $migrations, $reset): void {
        $reset();
        $migrator = new Migrator($connect(), $migrations);
        $all = $migrator->available();
        check($all !== [], 'keine Migrationen gefunden');
        same($all, $migrator->pending());
        same($all, $migrator->migrate());
        same([], $migrator->pending());
        same([], $migrator->migrate(), 'zweiter Lauf');
        same(end($all), $migrator->currentVersion());
    });

    test('Migration nur mit richtigem Schlüssel', function () use ($connect, $migrations, $reset): void {
        $reset();
        $api = new Api(validConfig(), $connect, $migrations);
        same(403, $api->handle('POST', 'admin/migrate', [])->status);
        same(403, $api->handle('POST', 'admin/migrate', ['x-migration-token' => 'falsch'])->status);
        $ok = $api->handle('POST', 'admin/migrate', ['x-migration-token' => str_repeat('a', 48)]);
        same(200, $ok->status);
        check($ok->body['applied'] !== [], 'nichts eingespielt');
    });

    test('Statusabfrage mit Datenbank', function () use ($connect, $migrations): void {
        $api = new Api(validConfig(), $connect, $migrations);
        $response = $api->handle('GET', 'health', []);
        same(200, $response->status);
        same('ok', $response->body['database']);
        same(0, $response->body['pending_migrations']);
    });

    test('nicht erreichbare Datenbank verrät keine Details', function () use ($migrations): void {
        $broken = validConfig(['db' => ['password' => 'falsch']]);
        $api = new Api($broken, static fn (): PDO => Database::connect($broken['db']), $migrations);
        $response = $api->handle('GET', 'health', []);
        same(503, $response->status);
        same(['status' => 'error', 'error' => 'database'], $response->body);
    });
} else {
    echo "Hinweis: TEST_DB_HOST nicht gesetzt – Datenbank-Tests übersprungen.\n";
}

// --- Ausführen --------------------------------------------------------------

foreach ($tests as [$name, $fn]) {
    try {
        $fn();
        echo "✔ $name\n";
    } catch (Throwable $e) {
        $failures++;
        echo "✖ $name\n  " . $e->getMessage() . "\n";
    }
}

echo sprintf("\n%d Tests, %d fehlgeschlagen\n", count($tests), $failures);
exit($failures === 0 ? 0 : 1);
