<?php

declare(strict_types=1);

namespace BensGames;

use PDO;
use RuntimeException;

/**
 * Spielt nummerierte SQL-Dateien aus api/migrations/ der Reihe nach ein (001_name.sql, 002_name.sql, …).
 *
 * MariaDB schreibt Tabellenänderungen sofort fest, Migrationen laufen also nicht in einer Transaktion.
 * Deshalb: pro Datei nur ein zusammengehöriger Schritt, und bereits eingespielte Dateien nie mehr ändern.
 */
final class Migrator
{
    private const NAME_PATTERN = '/^\d{3}_[a-z0-9_]+$/';

    public function __construct(private PDO $pdo, private string $dir)
    {
    }

    /** @return list<string> */
    public function available(): array
    {
        $versions = [];
        foreach (glob($this->dir . '/*.sql') ?: [] as $file) {
            $version = basename($file, '.sql');
            if (!preg_match(self::NAME_PATTERN, $version)) {
                throw new RuntimeException("Ungültiger Migrationsname: $version");
            }
            $versions[] = $version;
        }
        sort($versions, SORT_STRING);
        return $versions;
    }

    /** @return list<string> */
    public function applied(): array
    {
        $this->ensureTable();
        return $this->pdo->query('SELECT version FROM schema_migrations ORDER BY version')->fetchAll(PDO::FETCH_COLUMN);
    }

    /** @return list<string> */
    public function pending(): array
    {
        return array_values(array_diff($this->available(), $this->applied()));
    }

    public function currentVersion(): ?string
    {
        $applied = $this->applied();
        return $applied === [] ? null : end($applied);
    }

    /** @return list<string> eingespielte Versionen */
    public function migrate(): array
    {
        $done = [];
        foreach ($this->pending() as $version) {
            foreach (self::statements((string) file_get_contents("{$this->dir}/$version.sql")) as $statement) {
                $this->pdo->exec($statement);
            }
            $this->pdo->prepare('INSERT INTO schema_migrations (version) VALUES (?)')->execute([$version]);
            $done[] = $version;
        }
        return $done;
    }

    /** @return list<string> */
    public static function statements(string $sql): array
    {
        $withoutComments = preg_replace('/^\s*--.*$/m', '', $sql) ?? '';
        $parts = preg_split('/;\s*(?:\r?\n|$)/', $withoutComments) ?: [];
        return array_values(array_filter(array_map('trim', $parts), static fn (string $part): bool => $part !== ''));
    }

    private function ensureTable(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(100) NOT NULL PRIMARY KEY,
                applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
    }
}
