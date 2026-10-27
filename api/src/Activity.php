<?php

declare(strict_types=1);

namespace BensGames;

use DateTimeImmutable;
use DateTimeZone;
use PDO;

/**
 * Tägliche Aufgaben, Ruhmeshalle und Ticker.
 *
 * - Jede gemeldete Runde (POST games/<id>/scores) zählt in daily_activity (je Konto, Tag und Spiel nur Zähler).
 * - Tägliche Aufgaben: jeden Tag dieselben 3 für alle, aus einem festen Vorrat; Fortschritt aus daily_activity.
 * - Ruhmeshalle: Die tägliche Aufräum-Aufgabe sichert Platz 1–3 jeder abgelaufenen Wochenrangliste.
 * - Ticker: neue Rekorde, neue Erfolge, neue Community-Level, Wochensiege – nur von Konten, die in Ranglisten erscheinen.
 */
final class Activity
{
    public const KEEP_DAYS = 40;   // Tagesaktivität und erledigte Aufgaben
    public const FEED_DAYS = 30;   // Ticker
    public const FEED_SIZE = 20;
    public const TASKS_PER_DAY = 3;

    /** Aufgaben-Vorrat: id => [Text, Spiel (oder null = alle), Ziel] */
    public const TASKS = [
        'rounds3' => ['Spiele 3 Runden – egal welches Spiel', null, 3],
        'rounds10' => ['Spiele 10 Runden – egal welches Spiel', null, 10],
        'twogames' => ['Spiele zwei verschiedene Spiele', null, 2],
        'achievement' => ['Schalte einen neuen Erfolg frei', null, 1],
        'royal3' => ['Spiele 3 Runden Royal Blocks', 'royal-blocks', 3],
        'royal5000' => ['Schaffe 5.000 Punkte in einer Runde Royal Blocks', 'royal-blocks', 5000],
        'royaldaily' => ['Spiele die Tages-Challenge in Royal Blocks', 'royal-blocks', 1],
        'novalevel' => ['Schaffe ein Level in Nova Bastion', 'nova-bastion', 1],
        'novaendless' => ['Spiele eine Runde Endlos in Nova Bastion', 'nova-bastion', 1],
    ];

    /** Punkte für den Spieler-Rang: je Aufgabe 2, alle drei an einem Tag +4, zusammen höchstens 600 */
    public const TASK_POINTS = 2;
    public const DAY_BONUS = 4;
    public const TASK_POINTS_MAX = 600;

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** Heutiger Tag in deutscher Zeit (die Aufgaben wechseln um Mitternacht) */
    public function today(int $offsetDays = 0): string
    {
        return (new DateTimeImmutable('@' . ($this->clock->now() + $offsetDays * 86400)))
            ->setTimezone(new DateTimeZone('Europe/Berlin'))->format('Y-m-d');
    }

    // ---------- Erfassen ----------

    /** Eine gemeldete Runde. $listed: Konto erscheint in Ranglisten (dann auch im Ticker). */
    public function scored(int $userId, string $appId, string $board, int $score, bool $listed): void
    {
        $this->pdo->prepare(
            'INSERT INTO daily_activity (user_id, day, app_id, rounds, best, levels, daily_challenge, endless)
             VALUES (:user, :day, :app, 1, :score, :level, :daily, :endless)
             ON DUPLICATE KEY UPDATE rounds = rounds + 1, best = GREATEST(best, VALUES(best)), levels = levels + VALUES(levels),
               daily_challenge = GREATEST(daily_challenge, VALUES(daily_challenge)), endless = endless + VALUES(endless)'
        )->execute([
            'user' => $userId, 'day' => $this->today(), 'app' => $appId, 'score' => $score,
            'level' => ctype_digit($board) ? 1 : 0, 'daily' => $board === 'taeglich' ? 1 : 0, 'endless' => $board === 'endlos' ? 1 : 0,
        ]);
        if (!$listed) {
            return;
        }
        // Neuer Rekord aller Zeiten: Der beste sichtbare Eintrag gehört jetzt diesem Konto und wurde gerade erzielt.
        $top = $this->pdo->prepare(
            "SELECT l.user_id, l.score, l.achieved_at FROM leaderboard_entries l JOIN users u ON u.id = l.user_id
             WHERE " . Leaderboards::VISIBLE . " AND l.app_id = ? AND l.board = ? AND l.period = 'all'
             ORDER BY l.score DESC, l.achieved_at ASC, l.id ASC LIMIT 1"
        );
        $top->execute([$appId, $board]);
        $row = $top->fetch();
        if ($row && (int) $row['user_id'] === $userId && (int) $row['score'] === $score && $row['achieved_at'] === $this->clock->datetime()) {
            $this->feed($userId, 'record', $appId, $board, $score, null, null);
        }
    }

    /** Neue Erfolge aus einem Spielstand. */
    public function achievements(int $userId, string $appId, int $count, bool $listed): void
    {
        if ($count <= 0) {
            return;
        }
        $this->pdo->prepare(
            'INSERT INTO daily_activity (user_id, day, app_id, achievements) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE achievements = achievements + VALUES(achievements)'
        )->execute([$userId, $this->today(), $appId, $count]);
        if ($listed) {
            $this->feed($userId, 'achievements', $appId, '', null, $count, null);
        }
    }

    /** Ein neues Community-Level wurde veröffentlicht. */
    public function levelPublished(int $userId, string $appId, string $name, bool $listed): void
    {
        if ($listed) {
            $this->feed($userId, 'level', $appId, '', null, null, mb_substr($name, 0, 100));
        }
    }

    private function feed(int $userId, string $kind, string $appId, string $board, ?int $score, ?int $amount, ?string $title): void
    {
        // Pro Konto, Art, Spiel, Liste und Tag nur ein Eintrag – der wird aktualisiert (kein Überfluten)
        $this->pdo->prepare(
            'INSERT INTO feed_events (created_at, day, user_id, kind, app_id, board, score, amount, title)
             VALUES (:now, :day, :user, :kind, :app, :board, :score, :amount, :title)
             ON DUPLICATE KEY UPDATE created_at = VALUES(created_at), score = GREATEST(COALESCE(score, 0), COALESCE(VALUES(score), 0)),
               amount = COALESCE(amount, 0) + COALESCE(VALUES(amount), 0), title = COALESCE(VALUES(title), title)'
        )->execute([
            'now' => $this->clock->datetime(), 'day' => $this->today(), 'user' => $userId, 'kind' => $kind, 'app' => $appId,
            'board' => $board, 'score' => $score, 'amount' => $amount, 'title' => $title,
        ]);
    }

    // ---------- Tägliche Aufgaben ----------

    /** Die 3 Aufgaben eines Tages: für alle gleich, nur mit öffentlich spielbaren Spielen. @return list<string> */
    public function tasksFor(string $day): array
    {
        $games = array_flip($this->pdo->query("SELECT id FROM apps WHERE type = 'game' AND status <> 'private' AND status <> 'maintenance' AND visibility = 'all'")->fetchAll(PDO::FETCH_COLUMN));
        $pool = array_keys(array_filter(self::TASKS, static fn (array $t): bool => $t[1] === null || isset($games[$t[1]])));
        if (count($games) < 2) {
            $pool = array_values(array_diff($pool, ['twogames']));
        }
        // Gemischt nach dem Datum (gleiche Reihenfolge für alle), 10er-Aufgabe nie zusammen mit der 3er
        usort($pool, static fn (string $a, string $b): int => strcmp(hash('sha256', $day . $a), hash('sha256', $day . $b)));
        $picked = [];
        foreach ($pool as $task) {
            if (($task === 'rounds10' && in_array('rounds3', $picked, true)) || ($task === 'rounds3' && in_array('rounds10', $picked, true))) {
                continue;
            }
            $picked[] = $task;
            if (count($picked) === self::TASKS_PER_DAY) {
                break;
            }
        }
        return $picked;
    }

    /** @param array<string, mixed> $session */
    public function daily(array $session): Response
    {
        $userId = (int) $session['id'];
        $day = $this->today();
        $statement = $this->pdo->prepare('SELECT * FROM daily_activity WHERE user_id = ? AND day = ?');
        $statement->execute([$userId, $day]);
        $rows = $statement->fetchAll();
        $tasks = [];
        $done = 0;
        foreach ($this->tasksFor($day) as $id) {
            [$text, $app, $goal] = self::TASKS[$id];
            $value = $this->progress($id, $rows);
            $complete = $value >= $goal;
            if ($complete && $this->complete($userId, $day, $id)) {
                $this->pdo->prepare('UPDATE users SET tasks_done = tasks_done + 1 WHERE id = ?')->execute([$userId]);
            }
            $done += $complete ? 1 : 0;
            $tasks[] = ['id' => $id, 'text' => $text, 'app' => $app, 'progress' => min($value, $goal), 'goal' => $goal, 'done' => $complete];
        }
        if ($done === self::TASKS_PER_DAY && $this->complete($userId, $day, 'alle')) {
            $this->pdo->prepare('UPDATE users SET task_days = task_days + 1 WHERE id = ?')->execute([$userId]);
        }
        return new Response(200, [
            'day' => $day,
            'tasks' => $tasks,
            'streak' => $this->streak($userId),
            'points' => self::TASK_POINTS,
            'day_bonus' => self::DAY_BONUS,
        ]);
    }

    /** @param list<array<string, mixed>> $rows */
    private function progress(string $id, array $rows): int
    {
        $by = [];
        foreach ($rows as $row) {
            $by[$row['app_id']] = $row;
        }
        $sum = static fn (string $col): int => array_sum(array_map(static fn (array $r): int => (int) $r[$col], $rows));
        $app = static fn (string $appId, string $col): int => (int) ($by[$appId][$col] ?? 0);
        return match ($id) {
            'rounds3', 'rounds10' => $sum('rounds'),
            'twogames' => count(array_filter($rows, static fn (array $r): bool => (int) $r['rounds'] > 0)),
            'achievement' => $sum('achievements'),
            'royal3' => $app('royal-blocks', 'rounds'),
            'royal5000' => $app('royal-blocks', 'best'),
            'royaldaily' => $app('royal-blocks', 'daily_challenge'),
            'novalevel' => $app('nova-bastion', 'levels'),
            'novaendless' => $app('nova-bastion', 'endless'),
            default => 0,
        };
    }

    /** Merkt eine erledigte Aufgabe; true nur beim ersten Mal. */
    private function complete(int $userId, string $day, string $task): bool
    {
        $statement = $this->pdo->prepare('INSERT IGNORE INTO daily_tasks_done (user_id, day, task) VALUES (?, ?, ?)');
        $statement->execute([$userId, $day, $task]);
        return $statement->rowCount() > 0;
    }

    /** Tage in Folge mit allen drei Aufgaben (heute zählt mit, sobald fertig; sonst ab gestern) */
    public function streak(int $userId): int
    {
        $statement = $this->pdo->prepare("SELECT day FROM daily_tasks_done WHERE user_id = ? AND task = 'alle' ORDER BY day DESC LIMIT 60");
        $statement->execute([$userId]);
        $days = array_flip($statement->fetchAll(PDO::FETCH_COLUMN));
        $streak = 0;
        $offset = isset($days[$this->today()]) ? 0 : -1;
        while (isset($days[$this->today($offset - $streak)])) {
            $streak++;
        }
        return $streak;
    }

    /** Punkte für den Spieler-Rang aus erledigten Aufgaben */
    public static function rankPoints(int $tasksDone, int $taskDays): int
    {
        return min(self::TASK_POINTS_MAX, $tasksDone * self::TASK_POINTS + $taskDays * self::DAY_BONUS);
    }

    // ---------- Ruhmeshalle ----------

    /** Sichert Platz 1–3 jeder abgelaufenen, noch nicht gesicherten Woche. @return int gesicherte Wochen */
    public function archiveWeeks(string $currentWeek): int
    {
        $weeks = $this->pdo->prepare(
            "SELECT DISTINCT l.period FROM leaderboard_entries l LEFT JOIN hall_weeks_done h ON h.week = l.period
             WHERE l.period <> 'all' AND l.period < ? AND h.week IS NULL ORDER BY l.period"
        );
        $weeks->execute([$currentWeek]);
        $archived = 0;
        foreach ($weeks->fetchAll(PDO::FETCH_COLUMN) as $week) {
            $boards = $this->pdo->prepare('SELECT DISTINCT app_id, board FROM leaderboard_entries WHERE period = ?');
            $boards->execute([$week]);
            foreach ($boards->fetchAll() as $b) {
                $top = $this->pdo->prepare(
                    'SELECT l.user_id, l.score FROM leaderboard_entries l JOIN users u ON u.id = l.user_id
                     WHERE ' . Leaderboards::VISIBLE . ' AND l.app_id = ? AND l.board = ? AND l.period = ?
                     ORDER BY l.score DESC, l.achieved_at ASC, l.id ASC LIMIT 3'
                );
                $top->execute([$b['app_id'], $b['board'], $week]);
                foreach ($top->fetchAll() as $i => $row) {
                    $this->pdo->prepare('INSERT IGNORE INTO hall_of_fame (week, app_id, board, place, user_id, score) VALUES (?, ?, ?, ?, ?, ?)')
                        ->execute([$week, $b['app_id'], $b['board'], $i + 1, (int) $row['user_id'], (int) $row['score']]);
                    if ($i === 0) {
                        $this->feed((int) $row['user_id'], 'weekwin', $b['app_id'], $b['board'], (int) $row['score'], null, $week);
                    }
                }
            }
            $this->pdo->prepare('INSERT IGNORE INTO hall_weeks_done (week, archived_at) VALUES (?, ?)')->execute([$week, $this->clock->datetime()]);
            $archived++;
        }
        return $archived;
    }

    /** Öffentliche Ruhmeshalle: die letzten Wochen mit Platz 1–3 je Rangliste */
    public function hall(array $query): Response
    {
        $weeks = $this->pdo->query('SELECT week FROM hall_weeks_done ORDER BY week DESC LIMIT 8')->fetchAll(PDO::FETCH_COLUMN);
        $out = [];
        foreach ($weeks as $week) {
            $statement = $this->pdo->prepare(
                "SELECT h.app_id, a.name AS app_name, h.board, h.place, h.score, u.display_name, u.avatar, u.avatar_color
                 FROM hall_of_fame h JOIN users u ON u.id = h.user_id JOIN apps a ON a.id = h.app_id
                 WHERE h.week = ? AND u.status = 'active' AND u.leaderboard_opt_out = 0 AND a.status <> 'private' AND a.visibility = 'all'
                 ORDER BY a.sort_order, a.name, h.board, h.place"
            );
            $statement->execute([$week]);
            $out[] = ['week' => $week, 'entries' => array_map(static fn (array $r): array => [
                'app' => $r['app_id'], 'app_name' => $r['app_name'], 'board' => $r['board'], 'place' => (int) $r['place'],
                'score' => (int) $r['score'], 'display_name' => $r['display_name'], 'avatar' => $r['avatar'], 'avatar_color' => $r['avatar_color'],
            ], $statement->fetchAll())];
        }
        return new Response(200, ['weeks' => $out]);
    }

    /** Wochensiege eines Kontos (für das Profil) @return list<array<string, mixed>> */
    public function trophies(int $userId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT h.week, h.app_id, a.name AS app_name, h.board, h.score FROM hall_of_fame h JOIN apps a ON a.id = h.app_id
             WHERE h.user_id = ? AND h.place = 1 AND a.status <> 'private' AND a.visibility = 'all' ORDER BY h.week DESC LIMIT 50"
        );
        $statement->execute([$userId]);
        return array_map(static fn (array $r): array => [
            'week' => $r['week'], 'app' => $r['app_id'], 'app_name' => $r['app_name'], 'board' => $r['board'], 'score' => (int) $r['score'],
        ], $statement->fetchAll());
    }

    // ---------- Ticker ----------

    public function feedList(): Response
    {
        $statement = $this->pdo->prepare(
            "SELECT f.created_at, f.kind, f.app_id, a.name AS app_name, f.board, f.score, f.amount, f.title,
                    u.display_name, u.avatar, u.avatar_color
             FROM feed_events f JOIN users u ON u.id = f.user_id JOIN apps a ON a.id = f.app_id
             WHERE u.status = 'active' AND u.leaderboard_opt_out = 0 AND a.status <> 'private' AND a.visibility = 'all'
             ORDER BY f.created_at DESC, f.id DESC LIMIT " . self::FEED_SIZE
        );
        $statement->execute();
        return new Response(200, ['events' => array_map(static fn (array $r): array => [
            'at' => $r['created_at'], 'kind' => $r['kind'], 'app' => $r['app_id'], 'app_name' => $r['app_name'], 'board' => $r['board'],
            'score' => $r['score'] === null ? null : (int) $r['score'], 'amount' => $r['amount'] === null ? null : (int) $r['amount'],
            'title' => $r['title'], 'display_name' => $r['display_name'], 'avatar' => $r['avatar'], 'avatar_color' => $r['avatar_color'],
        ], $statement->fetchAll())]);
    }

    /** Aufräumen nach den Fristen. @return array<string, int> */
    public function cleanup(): array
    {
        $before = $this->today(-self::KEEP_DAYS);
        $feedBefore = $this->clock->datetime(-self::FEED_DAYS * 86400);
        $count = function (string $sql, array $params): int {
            $statement = $this->pdo->prepare($sql);
            $statement->execute($params);
            return $statement->rowCount();
        };
        return [
            'daily_activity' => $count('DELETE FROM daily_activity WHERE day < ?', [$before]),
            'daily_tasks_done' => $count('DELETE FROM daily_tasks_done WHERE day < ?', [$before]),
            'feed_events' => $count('DELETE FROM feed_events WHERE created_at < ?', [$feedBefore]),
        ];
    }
}
