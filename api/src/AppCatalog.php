<?php

declare(strict_types=1);

namespace BensGames;

use PDO;
use RuntimeException;

/**
 * App-Verzeichnis (Phase 3.5).
 *
 * Status:       public · beta · private · maintenance
 * Sichtbarkeit: all · signed_in · selected
 * „privat“ und „ausgewählte Nutzer“ sehen nur Konten mit Freigabe in app_access.
 */
final class AppCatalog
{
    private const TYPES = ['game', 'tool', 'workspace'];
    private const STATUSES = ['public', 'beta', 'private', 'maintenance'];
    private const VISIBILITIES = ['all', 'signed_in', 'selected'];

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /**
     * Gleicht die Apps aus apps.json ab. Neue Apps werden angelegt; bei bestehenden werden nur
     * Name, Typ, Beschreibung, Symbol, Pfad, Version und Reihenfolge aktualisiert.
     * @param list<array<string, mixed>> $apps
     * @return int Anzahl abgeglichener Apps
     */
    public function sync(array $apps): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO apps (id, name, type, description, icon, path, version, status, visibility, sort_order, created_at, updated_at)
             VALUES (:id, :name, :type, :description, :icon, :path, :version, :status, :visibility, :sort, :now, :now2)
             ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), description = VALUES(description),
               icon = VALUES(icon), path = VALUES(path), version = VALUES(version), sort_order = VALUES(sort_order),
               updated_at = VALUES(updated_at)'
        );
        foreach (array_values($apps) as $index => $app) {
            self::validate($app);
            $statement->execute([
                'id' => $app['id'],
                'name' => $app['name'],
                'type' => $app['type'],
                'description' => $app['description'],
                'icon' => $app['icon'],
                'path' => $app['path'],
                'version' => $app['version'],
                'status' => $app['status'],
                'visibility' => $app['visibility'],
                'sort' => $index,
                'now' => $this->clock->datetime(),
                'now2' => $this->clock->datetime(),
            ]);
        }
        return count($apps);
    }

    /** @return list<array<string, mixed>> Apps, die dieses Konto (oder ein Gast) sehen darf */
    public function visibleFor(?int $userId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT a.id, a.name, a.type, a.description, a.icon, a.path, a.version, a.status, a.visibility
             FROM apps a
             LEFT JOIN app_access x ON x.app_id = a.id AND x.user_id = :user
             WHERE (x.user_id IS NOT NULL)
                OR (a.status <> 'private' AND (a.visibility = 'all' OR (a.visibility = 'signed_in' AND :signed_in = 1)))
             ORDER BY a.sort_order, a.name"
        );
        $statement->execute(['user' => $userId ?? 0, 'signed_in' => $userId === null ? 0 : 1]);
        return $statement->fetchAll();
    }

    /** @param array<string, mixed> $app */
    private static function validate(array $app): void
    {
        foreach (['id', 'name', 'type', 'description', 'icon', 'path', 'version', 'status', 'visibility'] as $key) {
            if (!is_string($app[$key] ?? null) || $app[$key] === '') {
                throw new RuntimeException("App ohne Feld $key.");
            }
        }
        if (!in_array($app['type'], self::TYPES, true) || !in_array($app['status'], self::STATUSES, true) || !in_array($app['visibility'], self::VISIBILITIES, true)) {
            throw new RuntimeException("App {$app['id']}: ungültiger Typ, Status oder Sichtbarkeit.");
        }
    }
}
