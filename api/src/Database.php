<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

final class Database
{
    /** @param array<string, mixed> $db */
    public static function connect(array $db): PDO
    {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $db['host'], $db['name']);
        if (isset($db['port'])) {
            $dsn .= ';port=' . (int) $db['port'];
        }

        return new PDO($dsn, $db['user'], $db['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
}
