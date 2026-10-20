<?php

declare(strict_types=1);

namespace BensGames;

use RuntimeException;

/**
 * Lädt die Server-Konfiguration mit den Zugangsdaten.
 *
 * Die Datei liegt nie im Repo und nie im Webseiten-Ordner, sondern daneben:
 *   /bens-games-staging/api/      → /bens-games-staging-config/config.php
 *   /bens-games-live/api/         → /bens-games-live-config/config.php
 * Vorlage: api/config.example.php
 */
final class Config
{
    private const ENVIRONMENTS = ['staging', 'production', 'test'];
    private const MIN_SECRET_LENGTH = 32;

    public static function defaultPath(string $apiDir): string
    {
        $webroot = dirname($apiDir);
        return dirname($webroot) . '/' . basename($webroot) . '-config/config.php';
    }

    /** @return array<string, mixed> */
    public static function load(string $path): array
    {
        if (!is_file($path)) {
            throw new RuntimeException('Konfigurationsdatei fehlt: ' . $path);
        }
        $config = require $path;
        if (!is_array($config)) {
            throw new RuntimeException('Konfigurationsdatei muss ein Array zurückgeben.');
        }
        return self::validate($config);
    }

    /**
     * @param array<string, mixed> $config
     * @return array<string, mixed>
     */
    public static function validate(array $config): array
    {
        if (!in_array($config['environment'] ?? null, self::ENVIRONMENTS, true)) {
            throw new RuntimeException('environment muss staging oder production sein.');
        }

        $db = $config['db'] ?? null;
        if (!is_array($db)) {
            throw new RuntimeException('db fehlt.');
        }
        foreach (['host', 'name', 'user', 'password'] as $key) {
            if (!is_string($db[$key] ?? null) || $db[$key] === '') {
                throw new RuntimeException("db.$key fehlt.");
            }
        }

        foreach (['migration_token', 'app_secret'] as $key) {
            $value = $config[$key] ?? null;
            if (!is_string($value) || strlen($value) < self::MIN_SECRET_LENGTH || str_contains($value, 'HIER_')) {
                throw new RuntimeException("$key muss mindestens " . self::MIN_SECRET_LENGTH . ' Zeichen lang und ausgefüllt sein.');
            }
        }

        return $config;
    }
}
