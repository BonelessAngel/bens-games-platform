<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Löscht Daten nach den Fristen aus der Datenschutzerklärung. Wird täglich von GitHub Actions
 * angestoßen (.github/workflows/cleanup.yml), weil der Tarif keine Cronjobs hat.
 */
final class Cleanup
{
    public const AUDIT_DAYS = 90;          // Protokoll wichtiger Aktionen
    public const GAME_EVENT_DAYS = 90;     // Rohdaten der Spielstatistik
    public const UNVERIFIED_DAYS = 7;      // nie bestätigte Konten
    public const ENDED_SESSION_DAYS = 7;   // abgelaufene oder abgemeldete Sitzungen
    public const USED_TOKEN_DAYS = 7;      // verbrauchte oder abgelaufene E-Mail-Links
    public const RATE_LIMIT_DAYS = 1;      // Zähler für Anmeldeversuche

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** @return array<string, int> gelöschte Einträge je Tabelle */
    public function run(): array
    {
        $days = fn (int $n): string => $this->clock->datetime(-$n * 86400);
        $now = $this->clock->datetime();

        return [
            'audit_log' => $this->delete('DELETE FROM audit_log WHERE created_at < ?', [$days(self::AUDIT_DAYS)]),
            'game_events' => $this->delete('DELETE FROM game_events WHERE created_at < ?', [$days(self::GAME_EVENT_DAYS)]),
            'client_errors' => $this->delete('DELETE FROM client_errors WHERE created_at < ?', [$days(ClientErrors::KEEP_DAYS)]),
            'game_save_history' => $this->delete('DELETE FROM game_save_history WHERE saved_at < ?', [$days(SaveHistory::KEEP_DAYS)]),
            // Wochenranglisten nach 8 Wochen; die Bestwerte „gesamt“ bleiben bis zur Löschung des Kontos.
            'leaderboard_weeks' => $this->delete(
                "DELETE FROM leaderboard_entries WHERE period <> 'all' AND period < ?",
                [gmdate('o-\WW', $this->clock->now() - Leaderboards::WEEKS_KEPT * 7 * 86400)]
            ),
            'users_unverified' => $this->delete('DELETE FROM users WHERE email_verified_at IS NULL AND created_at < ?', [$days(self::UNVERIFIED_DAYS)]),
            'sessions' => $this->delete(
                'DELETE FROM sessions WHERE expires_at < ? OR revoked_at < ?',
                [$days(self::ENDED_SESSION_DAYS), $days(self::ENDED_SESSION_DAYS)]
            ),
            'email_tokens' => $this->delete(
                'DELETE FROM email_tokens WHERE expires_at < ? OR used_at < ?',
                [$days(self::USED_TOKEN_DAYS), $days(self::USED_TOKEN_DAYS)]
            ),
            'login_challenges' => $this->delete('DELETE FROM login_challenges WHERE expires_at < ?', [$now]),
            'rate_limits' => $this->delete('DELETE FROM rate_limits WHERE window_start < ?', [$days(self::RATE_LIMIT_DAYS)]),
        ];
    }

    /** @param list<string> $params */
    private function delete(string $sql, array $params): int
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return $statement->rowCount();
    }
}
