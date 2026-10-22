<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Community-Level (Phase 6). Schnittstelle für Spiele: docs/community-level-api.md.
 *
 * - Spielen kann jeder; hochladen, Daumen hoch und löschen nur mit Konto.
 * - Öffentlich sind Levelname, Inhalt, Anzeigename des Erstellers und die Bestenliste je Level.
 * - Ausgeblendete Level (Moderation) und Level gesperrter Konten erscheinen nicht.
 * - Nur Spiele mit eigener Prüfung (z. B. NovaBastionLevel) haben Community-Level.
 */
final class CommunityLevels
{
    public const MAX_PER_USER = 15;
    public const MAX_PER_APP = 500;
    public const MAX_BYTES = 60000;

    /** Spiele mit Community-Leveln und ihre Prüfung. */
    private const VALIDATORS = ['nova-bastion' => NovaBastionLevel::class];

    private const VISIBLE = "c.hidden_at IS NULL AND u.status = 'active'";

    public function __construct(private PDO $pdo, private Clock $clock, private RateLimiter $limiter, private AuditLog $audit)
    {
    }

    /**
     * Alle sichtbaren Level eines Spiels (ohne Karte). Mit Anmeldung zusätzlich „mine“ und „liked“.
     * @param array<string, mixed>|null $session
     */
    public function list(string $appId, ?array $session): Response
    {
        $this->assertSupported($appId);
        $me = $session === null ? 0 : (int) $session['id'];
        $statement = $this->pdo->prepare(
            'SELECT c.id, c.name, c.meta, c.plays, c.wins, c.likes, c.created_at, c.user_id, u.display_name,
                    (SELECT 1 FROM community_likes k WHERE k.level_id = c.id AND k.user_id = ?) AS liked
             FROM community_levels c JOIN users u ON u.id = c.user_id
             WHERE ' . self::VISIBLE . ' AND c.app_id = ?
             ORDER BY c.created_at DESC, c.id DESC LIMIT ' . self::MAX_PER_APP
        );
        $statement->execute([$me, $appId]);
        $rows = $statement->fetchAll();
        $best = $this->best(array_map(static fn (array $r): int => (int) $r['id'], $rows));
        return new Response(200, ['levels' => array_map(fn (array $row): array => $this->summary($row, $me, $best[(int) $row['id']] ?? []), $rows)]);
    }

    /** Ein Level mit Karte. @param array<string, string> $query {id} */
    public function get(string $appId, array $query): Response
    {
        $this->assertSupported($appId);
        $statement = $this->pdo->prepare(
            'SELECT c.id, c.name, c.meta, c.level, c.plays, c.wins, c.likes, c.created_at, c.user_id, u.display_name, 0 AS liked
             FROM community_levels c JOIN users u ON u.id = c.user_id
             WHERE ' . self::VISIBLE . ' AND c.app_id = ? AND c.id = ?'
        );
        $statement->execute([$appId, (int) ($query['id'] ?? 0)]);
        $row = $statement->fetch();
        if (!$row) {
            throw new HttpError(404, 'not_found');
        }
        $best = $this->best([(int) $row['id']]);
        return new Response(200, [
            'meta' => $this->summary($row, 0, $best[(int) $row['id']] ?? []),
            'level' => json_decode((string) $row['level'], false, 64, JSON_THROW_ON_ERROR),
        ]);
    }

    /**
     * Level hochladen. @param array<string, mixed> $session
     * @param array<string, mixed> $input {level, star, boss, style}
     */
    public function upload(array $session, string $appId, array $input, Request $request): Response
    {
        $validator = $this->assertSupported($appId);
        $userId = (int) $session['id'];
        if (strlen((string) json_encode($input['level'] ?? null)) > self::MAX_BYTES) {
            throw new HttpError(413, 'too_big');
        }
        $level = $validator::sanitize($input['level'] ?? null);
        if ($level === null) {
            throw new HttpError(422, 'bad_level');
        }
        $count = $this->pdo->prepare('SELECT COUNT(*) FROM community_levels WHERE user_id = ? AND app_id = ?');
        $count->execute([$userId, $appId]);
        if ((int) $count->fetchColumn() >= self::MAX_PER_USER) {
            throw new HttpError(429, 'limit');
        }
        $total = $this->pdo->prepare('SELECT COUNT(*) FROM community_levels WHERE app_id = ?');
        $total->execute([$appId]);
        if ((int) $total->fetchColumn() >= self::MAX_PER_APP) {
            throw new HttpError(429, 'full');
        }
        if ($this->limiter->exceeded('level_upload:user', (string) $userId, 1, 60)) {
            throw new HttpError(429, 'wait');
        }
        $this->limiter->hit('level_upload:user', (string) $userId, 1, 60);

        $star = (int) round(NovaBastionLevel::num($input['star'] ?? null, 1, 5) ?: 2);
        $meta = [
            'star' => $star,
            'boss' => !empty($input['boss']),
            'style' => in_array($input['style'] ?? null, NovaBastionLevel::STYLES, true) ? $input['style'] : 'moon',
            'np' => count($level['paths']),
            'focus' => $level['focus'],
            'thumb' => $level['paths'],
        ];
        $this->pdo->prepare(
            'INSERT INTO community_levels (app_id, user_id, name, meta, level, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$appId, $userId, $level['name'], json_encode($meta), json_encode($level), $this->clock->datetime()]);
        $id = (int) $this->pdo->lastInsertId();
        $this->audit->log('user.level_uploaded', $request, actorUserId: $userId, targetType: 'community_level', targetId: (string) $id);
        return new Response(200, ['ok' => true, 'id' => $id]);
    }

    /** Daumen hoch an/aus. @param array<string, mixed> $session @param array<string, mixed> $input {id} */
    public function like(array $session, string $appId, array $input): Response
    {
        $level = $this->visibleLevel($appId, $input['id'] ?? null);
        $userId = (int) $session['id'];
        if ((int) $level['user_id'] === $userId) {
            throw new HttpError(422, 'own_level');
        }
        if (!$this->limiter->hit('level_like:user', (string) $userId, 120, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }
        $delete = $this->pdo->prepare('DELETE FROM community_likes WHERE level_id = ? AND user_id = ?');
        $delete->execute([$level['id'], $userId]);
        $liked = $delete->rowCount() === 0;
        if ($liked) {
            $this->pdo->prepare('INSERT INTO community_likes (level_id, user_id, created_at) VALUES (?, ?, ?)')
                ->execute([$level['id'], $userId, $this->clock->datetime()]);
        }
        $this->pdo->prepare('UPDATE community_levels SET likes = (SELECT COUNT(*) FROM community_likes WHERE level_id = ?) WHERE id = ?')
            ->execute([$level['id'], $level['id']]);
        $likes = $this->pdo->prepare('SELECT likes FROM community_levels WHERE id = ?');
        $likes->execute([$level['id']]);
        return new Response(200, ['ok' => true, 'likes' => (int) $likes->fetchColumn(), 'liked' => $liked]);
    }

    /**
     * Ergebnis melden: zählt „gespielt“/„geschafft“; mit Konto und Sieg zusätzlich für die Bestenliste.
     * @param array<string, mixed>|null $session
     * @param array<string, mixed> $input {id, win, lives}
     */
    public function result(?array $session, string $appId, array $input, Request $request): Response
    {
        $level = $this->visibleLevel($appId, $input['id'] ?? null);
        $who = $session === null ? 'ip:' . (Security::ipPrefix($request->ip) ?? 'unbekannt') : 'user:' . $session['id'];
        if (!$this->limiter->hit('level_result', $who, 120, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }
        $win = ($input['win'] ?? null) === true;
        $this->pdo->prepare('UPDATE community_levels SET plays = plays + 1, wins = wins + ? WHERE id = ?')->execute([$win ? 1 : 0, $level['id']]);
        if ($win && $session !== null) {
            $lives = (int) round(NovaBastionLevel::num($input['lives'] ?? null, 0, 999) ?? 0);
            $this->pdo->prepare(
                'INSERT INTO community_results (level_id, user_id, lives, achieved_at) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE achieved_at = IF(VALUES(lives) > lives, VALUES(achieved_at), achieved_at), lives = GREATEST(lives, VALUES(lives))'
            )->execute([$level['id'], $session['id'], $lives, $this->clock->datetime()]);
        }
        return new Response(200, ['ok' => true]);
    }

    /** Eigenes Level löschen. @param array<string, mixed> $session @param array<string, mixed> $input {id} */
    public function delete(array $session, string $appId, array $input, Request $request): Response
    {
        $this->assertSupported($appId);
        $statement = $this->pdo->prepare('DELETE FROM community_levels WHERE id = ? AND app_id = ? AND user_id = ?');
        $statement->execute([(int) ($input['id'] ?? 0), $appId, $session['id']]);
        if ($statement->rowCount() === 0) {
            throw new HttpError(404, 'not_found');
        }
        $this->audit->log('user.level_deleted', $request, actorUserId: (int) $session['id'], targetType: 'community_level', targetId: (string) (int) ($input['id'] ?? 0));
        return new Response(200, ['ok' => true]);
    }

    /** Für die Moderation: alle Level eines Spiels inkl. ausgeblendeter. @param array<string, string> $query {app} */
    public function moderationList(array $query): Response
    {
        $apps = array_values(array_filter(
            $this->pdo->query("SELECT id, name FROM apps WHERE type = 'game' ORDER BY sort_order, name")->fetchAll(),
            static fn (array $app): bool => isset(self::VALIDATORS[$app['id']]),
        ));
        $appId = (string) ($query['app'] ?? '');
        if (!in_array($appId, array_column($apps, 'id'), true)) {
            $appId = $apps[0]['id'] ?? '';
        }
        $statement = $this->pdo->prepare(
            'SELECT c.id, c.name, c.plays, c.wins, c.likes, c.created_at, c.hidden_at, c.hidden_reason, u.id AS user_id, u.display_name, u.status
             FROM community_levels c JOIN users u ON u.id = c.user_id
             WHERE c.app_id = ? ORDER BY c.created_at DESC LIMIT 500'
        );
        $statement->execute([$appId]);
        return new Response(200, ['apps' => $apps, 'app' => $appId, 'levels' => $statement->fetchAll()]);
    }

    /** Aus-/einblenden (Recht „moderation“). @param array<string, mixed> $session @param array<string, mixed> $input {id, hidden, reason?} */
    public function setHidden(array $session, array $input, Request $request): Response
    {
        $id = (int) ($input['id'] ?? 0);
        $hidden = ($input['hidden'] ?? null) === true;
        $reason = mb_substr(trim((string) ($input['reason'] ?? '')), 0, 100);
        $statement = $this->pdo->prepare('UPDATE community_levels SET hidden_at = ?, hidden_by = ?, hidden_reason = ? WHERE id = ?');
        $statement->execute([$hidden ? $this->clock->datetime() : null, $hidden ? $session['id'] : null, $hidden ? ($reason ?: null) : null, $id]);
        if (!$this->exists($id)) {
            throw new HttpError(404, 'not_found');
        }
        $this->audit->log($hidden ? 'admin.level_hidden' : 'admin.level_shown', $request, actorUserId: (int) $session['id'], targetType: 'community_level', targetId: (string) $id, details: $reason !== '' ? ['reason' => $reason] : null);
        return new Response(200, ['hidden' => $hidden]);
    }

    /** Endgültig löschen (Recht „moderation“). @param array<string, mixed> $session @param array<string, mixed> $input {id} */
    public function moderatorDelete(array $session, array $input, Request $request): Response
    {
        $id = (int) ($input['id'] ?? 0);
        $statement = $this->pdo->prepare('DELETE FROM community_levels WHERE id = ?');
        $statement->execute([$id]);
        if ($statement->rowCount() === 0) {
            throw new HttpError(404, 'not_found');
        }
        $this->audit->log('admin.level_deleted', $request, actorUserId: (int) $session['id'], targetType: 'community_level', targetId: (string) $id);
        return new Response(200, ['status' => 'deleted']);
    }

    /** @param array<string, mixed> $row @param list<array{n: string, l: int}> $best */
    private function summary(array $row, int $me, array $best): array
    {
        $meta = json_decode((string) $row['meta'], true) ?: [];
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'author' => $row['display_name'],
            'mine' => $me !== 0 && (int) $row['user_id'] === $me,
            'liked' => (bool) $row['liked'],
            'star' => (int) ($meta['star'] ?? 2),
            'boss' => (bool) ($meta['boss'] ?? false),
            'style' => (string) ($meta['style'] ?? 'moon'),
            'np' => (int) ($meta['np'] ?? 1),
            'focus' => $meta['focus'] ?? null,
            'thumb' => $meta['thumb'] ?? [],
            'likes' => (int) $row['likes'],
            'plays' => (int) $row['plays'],
            'wins' => (int) $row['wins'],
            'best' => $best,
            // Millisekunden wie Date.now(), wie bisher bei Netlify
            't' => strtotime($row['created_at'] . ' UTC') * 1000,
        ];
    }

    /**
     * Bestenliste je Level: die drei Konten mit den meisten übrigen Leben (ohne Konten mit Ranglisten-Widerspruch).
     * @param list<int> $ids @return array<int, list<array{n: string, l: int}>>
     */
    private function best(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $statement = $this->pdo->prepare(
            "SELECT r.level_id, u.display_name, r.lives FROM community_results r JOIN users u ON u.id = r.user_id
             WHERE r.level_id IN ($marks) AND u.status = 'active' AND u.leaderboard_opt_out = 0
             ORDER BY r.level_id, r.lives DESC, r.achieved_at ASC"
        );
        $statement->execute($ids);
        $best = [];
        foreach ($statement->fetchAll() as $row) {
            $id = (int) $row['level_id'];
            if (count($best[$id] ?? []) < 3) {
                $best[$id][] = ['n' => $row['display_name'], 'l' => (int) $row['lives']];
            }
        }
        return $best;
    }

    /** @return array<string, mixed> */
    private function visibleLevel(string $appId, mixed $id): array
    {
        $this->assertSupported($appId);
        $statement = $this->pdo->prepare(
            'SELECT c.id, c.user_id FROM community_levels c JOIN users u ON u.id = c.user_id WHERE ' . self::VISIBLE . ' AND c.app_id = ? AND c.id = ?'
        );
        $statement->execute([$appId, is_int($id) || (is_string($id) && ctype_digit($id)) ? (int) $id : 0]);
        $row = $statement->fetch();
        if (!$row) {
            throw new HttpError(404, 'not_found');
        }
        return $row;
    }

    /** @return class-string<NovaBastionLevel> */
    private function assertSupported(string $appId): string
    {
        $validator = self::VALIDATORS[$appId] ?? null;
        $statement = $this->pdo->prepare("SELECT 1 FROM apps WHERE id = ? AND type = 'game'");
        $statement->execute([$appId]);
        if ($validator === null || !$statement->fetchColumn()) {
            throw new HttpError(404, 'unknown_game');
        }
        return $validator;
    }

    private function exists(int $id): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM community_levels WHERE id = ?');
        $statement->execute([$id]);
        return (bool) $statement->fetchColumn();
    }
}
