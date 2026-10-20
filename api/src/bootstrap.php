<?php
// Gemeinsamer Start für API und Tests: strenge Fehlerbehandlung, keine Fehlerausgabe an Besucher.

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

spl_autoload_register(static function (string $class): void {
    $prefix = 'BensGames\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});
