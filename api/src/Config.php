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
    private const BASE_URLS = [
        'staging' => 'https://staging.bens-games.de',
        'production' => 'https://bens-games.de',
        'test' => 'http://localhost',
    ];

    /**
     * Eigene Adresse für Links in E-Mails und für die Herkunftsprüfung.
     * Bewusst aus der Konfiguration und nie aus dem Host-Header der Anfrage.
     * @param array<string, mixed> $config
     */
    public static function baseUrl(array $config): string
    {
        $url = $config['base_url'] ?? self::BASE_URLS[$config['environment'] ?? ''] ?? '';
        return rtrim((string) $url, '/');
    }

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

        if (isset($config['base_url']) && !preg_match('#^https?://[a-z0-9.-]+(:\d+)?$#', (string) $config['base_url'])) {
            throw new RuntimeException('base_url muss eine Adresse wie https://bens-games.de sein (ohne Pfad).');
        }
        if (isset($config['mail']['from']) && !filter_var($config['mail']['from'], FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('mail.from ist keine gültige E-Mail-Adresse.');
        }

        return $config;
    }
}
