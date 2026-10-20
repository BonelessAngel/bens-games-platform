<?php
// Hilfen für die API-Tests (ohne Zusatzpakete).

declare(strict_types=1);

use BensGames\Api;
use BensGames\Clock;
use BensGames\Database;
use BensGames\Mailer;
use BensGames\Request;
use BensGames\Response;

$GLOBALS['tests'] = [];

function test(string $name, callable $fn): void
{
    $GLOBALS['tests'][] = [$name, $fn];
}

function dbTest(string $name, callable $fn): void
{
    if (getenv('TEST_DB_HOST')) {
        test($name, $fn);
    }
}

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function same(mixed $expected, mixed $actual, string $message = ''): void
{
    check($expected === $actual, trim($message . ' erwartet ' . var_export($expected, true) . ', erhalten ' . var_export($actual, true)));
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

const TEST_ORIGIN = 'https://test.bens-games.local';
const TEST_MIGRATION_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** @return array<string, mixed> */
function validConfig(array $overrides = []): array
{
    return array_replace_recursive([
        'environment' => 'test',
        'base_url' => TEST_ORIGIN,
        'db' => [
            'host' => getenv('TEST_DB_HOST') ?: 'localhost',
            'port' => (int) (getenv('TEST_DB_PORT') ?: 3306),
            'name' => getenv('TEST_DB_NAME') ?: 'test',
            'user' => getenv('TEST_DB_USER') ?: 'test',
            'password' => getenv('TEST_DB_PASSWORD') ?: 'test',
        ],
        'migration_token' => TEST_MIGRATION_TOKEN,
        'app_secret' => str_repeat('b', 64),
    ], $overrides);
}

function writeConfig(array $config): string
{
    $file = tempnam(sys_get_temp_dir(), 'bgcfg') . '.php';
    file_put_contents($file, '<?php return ' . var_export($config, true) . ';');
    return $file;
}

function migrationsDir(): string
{
    return __DIR__ . '/../migrations';
}

/** Merkt sich versendete E-Mails, statt sie zu verschicken. */
final class MemoryMailer implements Mailer
{
    /** @var list<array{to: string, subject: string, text: string}> */
    public array $sent = [];

    public function send(string $to, string $subject, string $text): void
    {
        $this->sent[] = ['to' => $to, 'subject' => $subject, 'text' => $text];
    }

    public function lastLink(): string
    {
        $last = end($this->sent);
        check($last !== false, 'keine E-Mail versendet');
        check((bool) preg_match('~/konto/bestaetigen/#([0-9a-f]{64})~', $last['text'], $m), 'kein Bestätigungslink in der E-Mail');
        return $m[1];
    }
}

/** Test-Umgebung mit frischer Datenbank, Test-Mailer und verstellbarer Uhr. */
final class TestApp
{
    public MemoryMailer $mailer;
    public int $time;
    public Api $api;
    public PDO $pdo;

    public function __construct()
    {
        $this->pdo = Database::connect(validConfig()['db']);
        resetDatabase($this->pdo);
        $this->mailer = new MemoryMailer();
        $this->time = 1_800_000_000;
        $this->api = new Api(
            validConfig(),
            fn (): PDO => $this->pdo,
            migrationsDir(),
            $this->mailer,
            new Clock(fn (): int => $this->time),
        );
        same(200, $this->api->handle(new Request('POST', 'admin/migrate', ['x-migration-token' => TEST_MIGRATION_TOKEN]))->status, 'Migration');
    }

    /** @param array<string, mixed>|null $json */
    public function post(string $path, ?array $json = [], array $headers = [], array $cookies = [], string $ip = '203.0.113.7'): Response
    {
        $headers += ['origin' => TEST_ORIGIN, 'content-type' => 'application/json', 'user-agent' => 'Testbrowser'];
        return $this->api->handle(new Request('POST', $path, $headers, $json === null ? '' : json_encode($json), $cookies, $ip));
    }

    public function get(string $path, array $cookies = []): Response
    {
        return $this->api->handle(new Request('GET', $path, [], '', $cookies, '203.0.113.7'));
    }

    /** Registriert, bestätigt und meldet an. @return array{cookies: array<string, string>, csrf: string} */
    public function signedIn(string $email = 'ben@example.org', string $password = 'ein sicheres Passwort'): array
    {
        same(202, $this->post('auth/register', ['email' => $email, 'display_name' => 'Ben', 'password' => $password])->status);
        same(200, $this->post('auth/verify', ['token' => $this->mailer->lastLink()])->status);
        $login = $this->post('auth/login', ['email' => $email, 'password' => $password]);
        same(200, $login->status, 'Anmeldung');
        return ['cookies' => [$login->cookies[0]['name'] => $login->cookies[0]['value']], 'csrf' => $login->body['csrf']];
    }
}

function resetDatabase(PDO $pdo): void
{
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
        $pdo->exec("DROP TABLE `$table`");
    }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}
