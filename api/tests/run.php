<?php
// Testlauf für die API ohne Zusatzpakete: php api/tests/run.php
// Datenbank-Tests laufen, wenn TEST_DB_HOST gesetzt ist (in GitHub Actions über einen MariaDB-Container).

declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';
require __DIR__ . '/lib.php';

// Abbrüche außerhalb einzelner Tests ebenfalls in GitHub sichtbar machen.
register_shutdown_function(static function (): void {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true) && getenv('GITHUB_ACTIONS')) {
        echo '::error title=PHP-Abbruch::' . str_replace(["\r", "\n"], ' ', "{$error['message']} ({$error['file']}:{$error['line']})") . "\n";
    }
});

foreach (glob(__DIR__ . '/*Test.php') as $file) {
    require $file;
}

if (!getenv('TEST_DB_HOST')) {
    echo "Hinweis: TEST_DB_HOST nicht gesetzt – Datenbank-Tests übersprungen.\n";
}

$failures = 0;
foreach ($GLOBALS['tests'] as [$name, $fn]) {
    try {
        $fn();
        echo "✔ $name\n";
    } catch (Throwable $e) {
        $failures++;
        echo "✖ $name\n  " . $e->getMessage() . "\n";
        // In GitHub Actions zusätzlich als sichtbarer Hinweis am Lauf.
        if (getenv('GITHUB_ACTIONS')) {
            $where = basename($e->getFile()) . ':' . $e->getLine();
            echo '::error title=API-Test::' . str_replace(["\r", "\n"], ' ', "$name – {$e->getMessage()} ($where)") . "\n";
        }
    }
}

echo sprintf("\n%d Tests, %d fehlgeschlagen\n", count($GLOBALS['tests']), $failures);
exit($failures === 0 ? 0 : 1);
