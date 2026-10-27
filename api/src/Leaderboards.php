<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Ranglisten (Phase 4b). Schnittstelle für Spiele: docs/ranglisten-api.md.
 *
 * - Nur angemeldete Konten erscheinen; öffentlich sind Anzeigename, Punkte und Datum.
 * - Pro Rangliste zählt der Bestwert: „diese Woche“ (ISO-Kalenderwoche, UTC) und „gesamt“.
 * - Ausgeblendete Einträge, gesperrte Konten und Konten mit Widerspruch erscheinen nicht.
 */
final class Leaderboards
{
    public const MAX_SCORE = 1_000_000_000;
    public const PAGE = 50;
    public const WEEKS_KEPT = 8; // ältere Wochenranglisten werden gelöscht, „gesamt“ bleibt

    public function __construct(private PDO $pdo, private Clock $clock, private RateLimiter $limiter, private AuditLog $audit)
    {
    }

    public function currentWeek(): string
    {
        return gmdate('o-\WW', $this->clock->now());
    }

    /** Ende der laufenden Wochen-Rangliste: nächster Montag 00:00 UTC (für den Countdown) */
    public function weekEnds(): string
    {
        $now = $this->clock->now();
        $days = 8 - (int) gmdate('N', $now);
        return gmdate('Y-m-d\TH:i:s\Z', gmmktime(0, 0, 0, (int) gmdate('n', $now), (int) gmdate('j', $now) + $days, (int) gmdate('Y', $now)));
    }

    /**
     * Punkte melden. Gespeichert wird nur, wenn es ein neuer Bestwert ist.
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input {board, score}
     */
    public function submit(array $session, string $appId, array $input): Response
    {
        $this->assertGame($appId);
        $board = (string) ($input['board'] ?? '');
        $score = $input['score'] ?? null;
        if (!preg_match('/^[A-Za-z0-9_.\-]{1,32}$/', $board) || !is_int($score) || $score < 0 || $score > self::MAX_SCORE) {
            throw new HttpError(422, 'validation');
        }
        $userId = (int) $session['id'];
        if (!$this->limiter->hit('scores:user', (string) $userId, 300, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }

        $upsert = $this->pdo->prepare(
            'INSERT INTO leaderboard_entries (app_id, board, period, user_id, score, achieved_at)
             VALUES (:app, :board, :period, :user, :score, :now)
             ON DUPLICATE KEY UPDATE
               achieved_at = IF(VALUES(score) > score, VALUES(achieved_at), achieved_at),
               score = GREATEST(score, VALUES(score))'
        );
        foreach ([$this->currentWeek(), 'all'] as $period) {
            $upsert->execute(['app' => $appId, 'board' => $board, 'period' => $period, 'user' => $userId, 'score' => $score, 'now' => $this->clock->datetime()]);
        }

        return new Response(200, [
            'week' => $this->rankOf($appId, $board, $this->currentWeek(), $userId),
            'all' => $this->rankOf($appId, $board, 'all', $userId),
            'listed' => empty($session['leaderboard_opt_out']),
        ]);
    }

    /**
     * Öffentliche Rangliste. Mit Anmeldung zusätzlich der eigene Platz.
     * @param array<string, string> $query {board, period: week|all, page}
     * @param array<string, mixed>|null $session
     */
    public function show(string $appId, array $query, ?array $session): Response
    {
        $this->assertGame($appId);
        $boards = $this->boards($appId);
        $board = (string) ($query['board'] ?? '');
        if (!in_array($board, $boards, true)) {
            $board = $boards[0] ?? '';
        }
        $period = ($query['period'] ?? 'week') === 'all' ? 'all' : $this->currentWeek();
        $page = max(1, (int) ($query['page'] ?? 1));

        $statement = $this->pdo->prepare(
            'SELECT u.display_name, u.avatar, u.avatar_color, l.score, l.achieved_at, l.user_id
             FROM leaderboard_entries l JOIN users u ON u.id = l.user_id
             WHERE ' . self::VISIBLE . ' AND l.app_id = ? AND l.board = ? AND l.period = ?
             ORDER BY l.score DESC, l.achieved_at ASC, l.id ASC
             LIMIT ' . self::PAGE . ' OFFSET ' . (($page - 1) * self::PAGE)
        );
        $statement->execute([$appId, $board, $period]);
        $offset = ($page - 1) * self::PAGE;
        $me = $session === null ? null : (int) $session['id'];
        $entries = [];
        foreach ($statement->fetchAll() as $index => $row) {
            $entries[] = [
                'rank' => $offset + $index + 1,
                'display_name' => $row['display_name'],
                'avatar' => $row['avatar'],
                'avatar_color' => $row['avatar_color'],
                'score' => (int) $row['score'],
                'achieved_at' => $row['achieved_at'],
                'me' => $me !== null && (int) $row['user_id'] === $me,
            ];
        }

        return new Response(200, [
            'app' => $appId,
            'boards' => $boards,
            'board' => $board,
            'period' => $period === 'all' ? 'all' : 'week',
            'week' => $this->currentWeek(),
            'week_ends' => $this->weekEnds(),
            'page' => $page,
            'entries' => $entries,
            'record' => $board === '' ? null : $this->record($appId, $board),
            'total' => $board === '' ? 0 : $this->total($appId, $board, $period),
            'me' => $me === null || $board === '' ? null : $this->rankOf($appId, $board, $period, $me) + $this->ahead($appId, $board, $period, $me),
        ]);
    }

    /** Hauptmodi stehen vorne (und sind die Standard-Rangliste), Archiv-Listen hinten. */
    private const PRIMARY_BOARDS = ['standard', 'normal', 'endlos'];
    private const ARCHIVE_BOARDS = ['klassisch'];

    /** @return list<string> Ranglisten eines Spiels: Hauptmodus zuerst, dann natürlich sortiert, Archiv zuletzt */
    public function boards(string $appId): array
    {
        $statement = $this->pdo->prepare("SELECT DISTINCT board FROM leaderboard_entries WHERE app_id = ? AND period = 'all'");
        $statement->execute([$appId]);
        $boards = $statement->fetchAll(PDO::FETCH_COLUMN);
        $weight = static function (string $board): int {
            $primary = array_search($board, self::PRIMARY_BOARDS, true);
            if ($primary !== false) {
                return $primary;
            }
            return in_array($board, self::ARCHIVE_BOARDS, true) ? 100 : 10;
        };
        usort($boards, static fn (string $a, string $b): int => ($weight($a) <=> $weight($b)) ?: strnatcmp($a, $b));
        return $boards;
    }

    /** Für die Moderation: alle Einträge inkl. ausgeblendeter. @param array<string, string> $query */
    public function moderationList(array $query): Response
    {
        $games = $this->pdo->query("SELECT id, name FROM apps WHERE type = 'game' ORDER BY sort_order, name")->fetchAll();
        $appId = (string) ($query['app'] ?? '');
        if (!in_array($appId, array_column($games, 'id'), true)) {
            $appId = $games[0]['id'] ?? '';
        }
        $boards = $this->boards($appId);
        $board = (string) ($query['board'] ?? '');
        if (!in_array($board, $boards, true)) {
            $board = $boards[0] ?? '';
        }
        $period = ($query['period'] ?? 'week') === 'all' ? 'all' : $this->currentWeek();
        $statement = $this->pdo->prepare(
            'SELECT l.id, l.board, l.score, l.achieved_at, l.hidden_at, l.hidden_reason, u.id AS user_id, u.display_name, u.status
             FROM leaderboard_entries l JOIN users u ON u.id = l.user_id
             WHERE l.app_id = ? AND l.board = ? AND l.period = ?
             ORDER BY l.score DESC, l.achieved_at ASC LIMIT 100'
        );
        $statement->execute([$appId, $board, $period]);
        return new Response(200, ['apps' => $games, 'app' => $appId, 'boards' => $boards, 'board' => $board, 'period' => $period === 'all' ? 'all' : 'week', 'entries' => $statement->fetchAll()]);
    }

    /**
     * Eintrag aus- oder wieder einblenden (Recht „moderation“).
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input {id, hidden: bool, reason?}
     */
    public function setHidden(array $session, array $input, Request $request): Response
    {
        $id = (int) ($input['id'] ?? 0);
        $hidden = ($input['hidden'] ?? null) === true;
        $reason = mb_substr(trim((string) ($input['reason'] ?? '')), 0, 100);
        $statement = $this->pdo->prepare(
            'UPDATE leaderboard_entries SET hidden_at = ?, hidden_by = ?, hidden_reason = ? WHERE id = ?'
        );
        $statement->execute([$hidden ? $this->clock->datetime() : null, $hidden ? $session['id'] : null, $hidden ? ($reason ?: null) : null, $id]);
        if ($statement->rowCount() === 0 && !$this->exists($id)) {
            throw new HttpError(404, 'not_found');
        }
        $this->audit->log($hidden ? 'admin.score_hidden' : 'admin.score_shown', $request, actorUserId: (int) $session['id'], targetType: 'score', targetId: (string) $id, details: $reason !== '' ? ['reason' => $reason] : null);
        return new Response(200, ['hidden' => $hidden]);
    }

    /** Rekord aller Zeiten einer Rangliste (bester sichtbarer Eintrag „gesamt“). @return array<string, mixed>|null */
    private function record(string $appId, string $board): ?array
    {
        $statement = $this->pdo->prepare(
            "SELECT u.display_name, u.avatar, u.avatar_color, l.score, l.achieved_at
             FROM leaderboard_entries l JOIN users u ON u.id = l.user_id
             WHERE " . self::VISIBLE . " AND l.app_id = ? AND l.board = ? AND l.period = 'all'
             ORDER BY l.score DESC, l.achieved_at ASC, l.id ASC LIMIT 1"
        );
        $statement->execute([$appId, $board]);
        $row = $statement->fetch();
        return $row ? [
            'display_name' => $row['display_name'],
            'avatar' => $row['avatar'],
            'avatar_color' => $row['avatar_color'],
            'score' => (int) $row['score'],
            'achieved_at' => $row['achieved_at'],
        ] : null;
    }

    public const VISIBLE = "l.hidden_at IS NULL AND u.status = 'active' AND u.leaderboard_opt_out = 0";

    /** @return array{rank: int|null, score: int|null} */
    public function rankOf(string $appId, string $board, string $period, int $userId): array
    {
        $own = $this->pdo->prepare(
            'SELECT l.score, l.achieved_at, l.id FROM leaderboard_entries l JOIN users u ON u.id = l.user_id
             WHERE ' . self::VISIBLE . ' AND l.app_id = ? AND l.board = ? AND l.period = ? AND l.user_id = ?'
        );
        $own->execute([$appId, $board, $period, $userId]);
        $row = $own->fetch();
        if (!$row) {
            return ['rank' => null, 'score' => null];
        }
        $better = $this->pdo->prepare(
            'SELECT COUNT(*) FROM leaderboard_entries l JOIN users u ON u.id = l.user_id
             WHERE ' . self::VISIBLE . ' AND l.app_id = ? AND l.board = ? AND l.period = ?
               AND (l.score > ? OR (l.score = ? AND (l.achieved_at < ? OR (l.achieved_at = ? AND l.id < ?))))'
        );
        $better->execute([$appId, $board, $period, $row['score'], $row['score'], $row['achieved_at'], $row['achieved_at'], $row['id']]);
        return ['rank' => (int) $better->fetchColumn() + 1, 'score' => (int) $row['score']];
    }

    /** Wie viele Spieler in dieser Rangliste stehen */
    private function total(string $appId, string $board, string $period): int
    {
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM leaderboard_entries l JOIN users u ON u.id = l.user_id
             WHERE ' . self::VISIBLE . ' AND l.app_id = ? AND l.board = ? AND l.period = ?'
        );
        $statement->execute([$appId, $board, $period]);
        return (int) $statement->fetchColumn();
    }

    /** Punkte bis zum nächsten besseren Platz (null, wenn man vorne steht oder keinen Eintrag hat) @return array{ahead: int|null} */
    private function ahead(string $appId, string $board, string $period, int $userId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT MIN(l.score) FROM leaderboard_entries l JOIN users u ON u.id = l.user_id
             WHERE ' . self::VISIBLE . ' AND l.app_id = ? AND l.board = ? AND l.period = ? AND l.user_id <> ?
               AND l.score > (SELECT o.score FROM leaderboard_entries o WHERE o.app_id = ? AND o.board = ? AND o.period = ? AND o.user_id = ?)'
        );
        $statement->execute([$appId, $board, $period, $userId, $appId, $board, $period, $userId]);
        $next = $statement->fetchColumn();
        if ($next === null || $next === false) {
            return ['ahead' => null];
        }
        $own = $this->rankOf($appId, $board, $period, $userId)['score'];
        return ['ahead' => $own === null ? null : (int) $next - $own + 1];
    }

    private function exists(int $id): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM leaderboard_entries WHERE id = ?');
        $statement->execute([$id]);
        return (bool) $statement->fetchColumn();
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
