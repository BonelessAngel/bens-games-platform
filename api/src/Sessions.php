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
    public const LIFETIME = 86400;              // ohne „Angemeldet bleiben“: 24 Stunden
    public const PERSISTENT_LIFETIME = 2592000; // mit „Angemeldet bleiben“: 30 Tage

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** @return array{token: string, csrf: string, expires: int} expires = 0 für Browser-Sitzung */
    public function create(int $userId, Request $request, bool $persistent = false): array
    {
        $token = Security::randomToken();
        $csrf = Security::randomToken();
        $lifetime = $persistent ? self::PERSISTENT_LIFETIME : self::LIFETIME;
        $this->pdo->prepare(
            'INSERT INTO sessions (user_id, token_hash, csrf_token, created_at, last_seen_at, expires_at, persistent, user_agent, ip_prefix)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $userId,
            Security::hashToken($token),
            $csrf,
            $this->clock->datetime(),
            $this->clock->datetime(),
            $this->clock->datetime($lifetime),
            $persistent ? 1 : 0,
            mb_substr($request->header('user-agent'), 0, 255) ?: null,
            Security::ipPrefix($request->ip),
        ]);
        return ['token' => $token, 'csrf' => $csrf, 'expires' => $persistent ? $this->clock->now() + $lifetime : 0];
    }

    /** @return array<string, mixed>|null Sitzung mit Kontodaten oder null */
    public function current(Request $request): ?array
    {
        $token = $request->cookies[self::COOKIE] ?? '';
        if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
            return null;
        }
        $statement = $this->pdo->prepare(
            "SELECT s.id AS session_id, s.csrf_token, u.id, u.email, u.display_name, u.email_verified_at, u.status, u.password_hash
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

    /** @return list<array<string, mixed>> aktive Sitzungen eines Kontos, neueste zuerst */
    public function active(int $userId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, created_at, last_seen_at, expires_at, persistent, user_agent, ip_prefix FROM sessions
             WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC'
        );
        $statement->execute([$userId, $this->clock->datetime()]);
        return $statement->fetchAll();
    }

    /** Beendet eine Sitzung – nur, wenn sie zum Konto gehört. */
    public function revoke(int $sessionId, ?int $userId = null): bool
    {
        $sql = 'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL';
        $params = [$this->clock->datetime(), $sessionId];
        if ($userId !== null) {
            $sql .= ' AND user_id = ?';
            $params[] = $userId;
        }
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return $statement->rowCount() > 0;
    }

    /** Beendet alle Sitzungen eines Kontos, optional außer einer. @return int Anzahl */
    public function revokeAll(int $userId, ?int $exceptSessionId = null): int
    {
        $statement = $this->pdo->prepare(
            'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id <> ?'
        );
        $statement->execute([$this->clock->datetime(), $userId, $exceptSessionId ?? 0]);
        return $statement->rowCount();
    }
}
