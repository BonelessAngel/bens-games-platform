<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Anmelde-Sitzungen. Der Browser bekommt einen Zufallswert im Cookie __Host-bg_session,
 * die Datenbank speichert nur dessen SHA-256. Jede Sitzung hat ein eigenes CSRF-Token.
 */
final class Sessions
{
    public const COOKIE = '__Host-bg_session';
    public const LIFETIME = 86400; // 24 Stunden; „Angemeldet bleiben“ folgt in Phase 3.3

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** @return array{token: string, csrf: string} */
    public function create(int $userId, Request $request): array
    {
        $token = Security::randomToken();
        $csrf = Security::randomToken();
        $this->pdo->prepare(
            'INSERT INTO sessions (user_id, token_hash, csrf_token, created_at, last_seen_at, expires_at, user_agent, ip_prefix)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $userId,
            Security::hashToken($token),
            $csrf,
            $this->clock->datetime(),
            $this->clock->datetime(),
            $this->clock->datetime(self::LIFETIME),
            mb_substr($request->header('user-agent'), 0, 255) ?: null,
            Security::ipPrefix($request->ip),
        ]);
        return ['token' => $token, 'csrf' => $csrf];
    }

    /** @return array<string, mixed>|null Sitzung mit Kontodaten oder null */
    public function current(Request $request): ?array
    {
        $token = $request->cookies[self::COOKIE] ?? '';
        if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
            return null;
        }
        $statement = $this->pdo->prepare(
            "SELECT s.id AS session_id, s.csrf_token, u.id, u.email, u.display_name, u.email_verified_at, u.status
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'"
        );
        $statement->execute([Security::hashToken($token), $this->clock->datetime()]);
        $session = $statement->fetch();
        if (!$session) {
            return null;
        }
        $this->pdo->prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')->execute([$this->clock->datetime(), $session['session_id']]);
        return $session;
    }

    public function revoke(int $sessionId): void
    {
        $this->pdo->prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')->execute([$this->clock->datetime(), $sessionId]);
    }
}
