<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Zählt Versuche pro Zeitfenster (z. B. Anmeldungen pro gekürzter IP oder pro E-Mail).
 * Gespeichert wird nur ein Hash des Schlüssels, keine E-Mail-Adresse und keine IP.
 */
final class RateLimiter
{
    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** Zählt einen Versuch und gibt zurück, ob er noch erlaubt ist. */
    public function hit(string $kind, string $value, int $limit, int $windowSeconds): bool
    {
        $bucket = hash('sha256', $kind . "\0" . $value);
        $now = $this->clock->datetime();
        $windowStart = $this->clock->datetime(-$windowSeconds);

        // Reihenfolge wichtig: MariaDB wertet die Zuweisungen von links nach rechts aus,
        // hits muss also noch das alte window_start sehen.
        $this->pdo->prepare(
            'INSERT INTO rate_limits (bucket, window_start, hits) VALUES (:bucket, :now, 1)
             ON DUPLICATE KEY UPDATE
               hits = IF(window_start < :start1, 1, hits + 1),
               window_start = IF(window_start < :start2, :now2, window_start)'
        )->execute(['bucket' => $bucket, 'now' => $now, 'start1' => $windowStart, 'start2' => $windowStart, 'now2' => $now]);

        $statement = $this->pdo->prepare('SELECT hits FROM rate_limits WHERE bucket = ?');
        $statement->execute([$bucket]);
        return (int) $statement->fetchColumn() <= $limit;
    }

    public function clear(string $kind, string $value): void
    {
        $this->pdo->prepare('DELETE FROM rate_limits WHERE bucket = ?')->execute([hash('sha256', $kind . "\0" . $value)]);
    }
}
