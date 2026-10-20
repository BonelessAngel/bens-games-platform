<?php
// Einziger direkt aufrufbarer Einstieg der API (alle Anfragen unter /api/ landen per .htaccess hier).

declare(strict_types=1);

require __DIR__ . '/src/bootstrap.php';

use BensGames\Api;
use BensGames\Config;
use BensGames\Database;

$config = null;
try {
    $config = Config::load(Config::defaultPath(__DIR__));
} catch (Throwable $e) {
    error_log('Bens Games API (config): ' . $e->getMessage());
}

$api = new Api(
    $config,
    $config === null ? null : static fn (): PDO => Database::connect($config['db']),
    __DIR__ . '/migrations',
);

$path = (string) (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$path = (string) preg_replace('#^/api(?:/|$)#', '', $path);
$headers = array_change_key_case(function_exists('getallheaders') ? (getallheaders() ?: []) : [], CASE_LOWER);

$api->handle($_SERVER['REQUEST_METHOD'] ?? 'GET', $path, $headers)->send();
