<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Spielstände und Erfolge im Konto (Phase 4a). Schnittstelle für Spiele: docs/spielstaende-api.md.
 *
 * - Ein Spielstand pro Konto und Spiel; Inhalt ist für die Plattform ein undurchsichtiger Text.
 * - Der neuere Stand gewinnt (Zeitstempel des Spiels in Millisekunden, „t“). Ein älterer Stand wird
 *   abgelehnt und der gespeicherte zurückgegeben, damit das Spiel ihn übernehmen kann.
 * - Erfolge werden nur hinzugefügt, nie über diese Schnittstelle entfernt.
 */
final class GameSaves
{
    public const MAX_BYTES = 524288;      // 512 KB je Spielstand
    public const MAX_ACHIEVEMENTS = 500;  // je Speichervorgang

    public function __construct(private PDO $pdo, private Clock $clock, private RateLimiter $limiter, private AuditLog $audit)
    {
    }

    /** @param array<string, mixed> $session */
    public function get(array $session, string $appId): Response
    {
        $this->assertGame($appId);
        $statement = $this->pdo->prepare('SELECT data, client_time, updated_at FROM game_saves WHERE user_id = ? AND app_id = ?');
        $statement->execute([$session['id'], $appId]);
        $row = $statement->fetch();
        return new Response(200, [
            'save' => $row ? ['data' => $row['data'], 't' => (int) $row['client_time'], 'updated_at' => $row['updated_at']] : null,
            'achievements' => $this->achievements((int) $session['id'], $appId),
        ]);
    }

    /**
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input {data: string, t: int, achievements?: list<string>}
     */
    public function put(array $session, string $appId, array $input): Response
    {
        $this->assertGame($appId);
        $userId = (int) $session['id'];
        if (!$this->limiter->hit('save:user', $userId . ':' . $appId, 240, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }

        $data = $input['data'] ?? null;
        $time = $input['t'] ?? null;
        if (!is_string($data) || $data === '' || !is_int($time) || $time < 0) {
            throw new HttpError(422, 'validation', ['fields' => ['data' => 'data (Text) und t (Zahl) werden benötigt.']]);
        }
        if (strlen($data) > self::MAX_BYTES) {
            throw new HttpError(413, 'too_large', ['max_bytes' => self::MAX_BYTES]);
        }
        json_decode($data);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new HttpError(422, 'validation', ['fields' => ['data' => 'data muss gültiges JSON sein.']]);
        }

        // Nur speichern, wenn der neue Stand nicht älter ist als der gespeicherte.
        $statement = $this->pdo->prepare(
            'INSERT INTO game_saves (user_id, app_id, data, client_time, size, updated_at) VALUES (:user, :app, :data, :t, :size, :now)
             ON DUPLICATE KEY UPDATE
               data = IF(:t2 >= client_time, VALUES(data), data),
               size = IF(:t3 >= client_time, VALUES(size), size),
               updated_at = IF(:t4 >= client_time, VALUES(updated_at), updated_at),
               client_time = GREATEST(client_time, VALUES(client_time))'
        );
        $statement->execute([
            'user' => $userId, 'app' => $appId, 'data' => $data, 't' => $time, 'size' => strlen($data),
            'now' => $this->clock->datetime(), 't2' => $time, 't3' => $time, 't4' => $time,
        ]);

        $stored = $this->pdo->prepare('SELECT data, client_time, updated_at FROM game_saves WHERE user_id = ? AND app_id = ?');
        $stored->execute([$userId, $appId]);
        $row = $stored->fetch();
        $added = $this->addAchievements($userId, $appId, $input['achievements'] ?? []);

        if ((int) $row['client_time'] > $time) {
            return new Response(409, [
                'error' => 'newer_save',
                'save' => ['data' => $row['data'], 't' => (int) $row['client_time'], 'updated_at' => $row['updated_at']],
                'achievements_added' => $added,
            ]);
        }
        return new Response(200, ['status' => 'saved', 't' => $time, 'achievements_added' => $added]);
    }

    /** @param array<string, mixed> $session */
    public function delete(array $session, string $appId, Request $request): Response
    {
        $this->assertGame($appId);
        $userId = (int) $session['id'];
        $this->pdo->prepare('DELETE FROM game_saves WHERE user_id = ? AND app_id = ?')->execute([$userId, $appId]);
        $this->pdo->prepare('DELETE FROM game_achievements WHERE user_id = ? AND app_id = ?')->execute([$userId, $appId]);
        $this->audit->log('game.save_deleted', $request, actorUserId: $userId, targetType: 'app', targetId: $appId);
        return new Response(200, ['status' => 'deleted']);
    }

    /** Übersicht für „Mein Konto“. @param array<string, mixed> $session */
    public function overview(array $session): Response
    {
        $statement = $this->pdo->prepare(
            'SELECT a.id, a.name, a.path, s.updated_at, s.size,
                    (SELECT COUNT(*) FROM game_achievements g WHERE g.user_id = s.user_id AND g.app_id = s.app_id) AS achievements
             FROM game_saves s JOIN apps a ON a.id = s.app_id
             WHERE s.user_id = ? ORDER BY s.updated_at DESC'
        );
        $statement->execute([$session['id']]);
        $games = array_map(static fn (array $row): array => [
            'id' => $row['id'],
            'name' => $row['name'],
            'path' => $row['path'],
            'updated_at' => $row['updated_at'],
            'size' => (int) $row['size'],
            'achievements' => (int) $row['achievements'],
        ], $statement->fetchAll());
        return new Response(200, ['games' => $games]);
    }

    /** @return list<string> */
    private function achievements(int $userId, string $appId): array
    {
        $statement = $this->pdo->prepare('SELECT achievement_id FROM game_achievements WHERE user_id = ? AND app_id = ? ORDER BY unlocked_at, achievement_id');
        $statement->execute([$userId, $appId]);
        return $statement->fetchAll(PDO::FETCH_COLUMN);
    }

    private function addAchievements(int $userId, string $appId, mixed $ids): int
    {
        if (!is_array($ids)) {
            throw new HttpError(422, 'validation', ['fields' => ['achievements' => 'achievements muss eine Liste sein.']]);
        }
        $ids = array_values(array_unique(array_filter($ids, 'is_string')));
        if (count($ids) > self::MAX_ACHIEVEMENTS) {
            throw new HttpError(422, 'validation', ['fields' => ['achievements' => 'Zu viele Erfolge auf einmal.']]);
        }
        $insert = $this->pdo->prepare('INSERT IGNORE INTO game_achievements (user_id, app_id, achievement_id, unlocked_at) VALUES (?, ?, ?, ?)');
        $added = 0;
        foreach ($ids as $id) {
            if (!preg_match('/^[A-Za-z0-9_.\-]{1,64}$/', $id)) {
                continue;
            }
            $insert->execute([$userId, $appId, $id, $this->clock->datetime()]);
            $added += $insert->rowCount();
        }
        return $added;
    }

    private function assertGame(string $appId): void
    {
        $statement = $this->pdo->prepare("SELECT 1 FROM apps WHERE id = ? AND type = 'game'");
        $statement->execute([$appId]);
        if (!$statement->fetchColumn()) {
            throw new HttpError(404, 'unknown_game');
        }
    }
}
