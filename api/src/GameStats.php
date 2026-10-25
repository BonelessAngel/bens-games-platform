<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Spielstatistik (Phase 5b). Schnittstelle für Spiele: docs/statistik-api.md.
 *
 * Ereignis-Typen:
 *   start        Spiel geöffnet
 *   heartbeat    „noch aktiv“, seconds = aktive Sekunden seit dem letzten Signal (ergibt die Spielzeit)
 *   level_start  Level begonnen (level)
 *   level_end    Level beendet (level, result win|lose|abort, optional score, stars, seconds, data)
 */
final class GameStats
{
    public const TYPES = ['start', 'heartbeat', 'level_start', 'level_end'];
    public const RESULTS = ['win', 'lose', 'abort'];
    public const MAX_EVENTS = 50;
    public const MAX_DATA_KEYS = 12;
    public const MAX_DAYS = 90;
    private const MIN_TRIES_FOR_RANKING = 5; // „schwerstes Level“ erst ab so vielen Versuchen

    public function __construct(private PDO $pdo, private Clock $clock, private RateLimiter $limiter)
    {
    }

    /**
     * Nimmt Ereignisse eines Spiels entgegen. $session ist die Anmeldung auf der Webseite oder null (Gast).
     * @param array<string, mixed> $input {app, visit, events: list<array>}
     * @param array<string, mixed>|null $session
     */
    public function record(array $input, ?array $session, Request $request): Response
    {
        $app = (string) ($input['app'] ?? '');
        $visit = (string) ($input['visit'] ?? '');
        $events = $input['events'] ?? null;
        if (!preg_match('/^[0-9a-f]{16,32}$/', $visit) || !is_array($events) || $events === [] || count($events) > self::MAX_EVENTS) {
            throw new HttpError(422, 'validation');
        }
        $statement = $this->pdo->prepare("SELECT 1 FROM apps WHERE id = ? AND type = 'game'");
        $statement->execute([$app]);
        if (!$statement->fetchColumn()) {
            throw new HttpError(404, 'unknown_game');
        }
        if (!$this->limiter->hit('events:ip', Security::ipPrefix($request->ip) ?? 'unbekannt', 3000, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }

        $userId = null;
        if ($session !== null && empty($session['stats_opt_out'])) {
            $userId = (int) $session['id'];
        }

        $insert = $this->pdo->prepare(
            'INSERT INTO game_events (created_at, app_id, user_id, visit, type, level, result, score, stars, seconds, data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stored = 0;
        foreach ($events as $event) {
            $row = self::normalizeEvent($event);
            if ($row === null) {
                continue;
            }
            $insert->execute([
                $this->clock->datetime(), $app, $userId, $visit, $row['type'], $row['level'], $row['result'],
                $row['score'], $row['stars'], $row['seconds'], $row['data'],
            ]);
            $stored++;
        }
        return new Response(202, ['stored' => $stored]);
    }

    /**
     * Prüft ein Ereignis streng; Unbekanntes wird verworfen statt gespeichert (keine Freitexte, keine personenbezogenen Daten).
     * @return array<string, mixed>|null
     */
    public static function normalizeEvent(mixed $event): ?array
    {
        if (!is_array($event) || !in_array($event['type'] ?? null, self::TYPES, true)) {
            return null;
        }
        $type = $event['type'];
        $level = isset($event['level']) && is_scalar($event['level']) ? (string) $event['level'] : null;
        if ($level !== null && !preg_match('/^[A-Za-z0-9_.\-]{1,32}$/', $level)) {
            return null;
        }
        if (in_array($type, ['level_start', 'level_end'], true) && $level === null) {
            return null;
        }
        $result = $event['result'] ?? null;
        if ($type === 'level_end' && !in_array($result, self::RESULTS, true)) {
            return null;
        }

        $int = static function (mixed $value, int $max): ?int {
            return is_int($value) && $value >= 0 ? min($value, $max) : null;
        };

        $data = null;
        if (isset($event['data']) && is_array($event['data'])) {
            $clean = [];
            foreach ($event['data'] as $key => $value) {
                if (count($clean) >= self::MAX_DATA_KEYS) {
                    break;
                }
                if (!is_string($key) || !preg_match('/^[a-z0-9_]{1,32}$/', $key)) {
                    continue;
                }
                if (is_int($value) && $value >= 0) {
                    $clean[$key] = min($value, 1_000_000);
                } elseif (is_string($value) && preg_match('/^[a-z0-9_\-]{1,32}$/', $value)) {
                    $clean[$key] = $value;
                }
            }
            $data = $clean === [] ? null : json_encode($clean, JSON_THROW_ON_ERROR);
        }

        return [
            'type' => $type,
            'level' => $level,
            'result' => $type === 'level_end' ? $result : null,
            'score' => $int($event['score'] ?? null, 1_000_000_000),
            'stars' => $int($event['stars'] ?? null, 10),
            'seconds' => $int($event['seconds'] ?? null, $type === 'heartbeat' ? 600 : 86400),
            'data' => $data,
        ];
    }

    /**
     * Auswertung eines Spiels für die Zentrale.
     * @param array<string, string> $query {app, days}
     */
    public function report(array $query): Response
    {
        $app = (string) ($query['app'] ?? '');
        $days = max(1, min(self::MAX_DAYS, (int) ($query['days'] ?? 30)));
        $since = $this->clock->datetime(-$days * 86400);

        $apps = $this->pdo->query("SELECT id, name FROM apps WHERE type = 'game' ORDER BY sort_order, name")->fetchAll();
        if (!in_array($app, array_column($apps, 'id'), true)) {
            $app = $apps[0]['id'] ?? '';
        }
        $params = [$app, $since];

        $totals = $this->one(
            "SELECT COUNT(DISTINCT visit) AS visits,
                    COUNT(DISTINCT user_id) AS players,
                    COALESCE(SUM(CASE WHEN type = 'heartbeat' THEN seconds END), 0) AS seconds,
                    SUM(type = 'level_start') AS level_starts,
                    SUM(type = 'level_end' AND result = 'win') AS wins
             FROM game_events WHERE app_id = ? AND created_at >= ?",
            $params
        );
        $totals = array_map('intval', $totals);
        $totals['avg_seconds_per_visit'] = $totals['visits'] > 0 ? intdiv($totals['seconds'], $totals['visits']) : 0;

        $daily = $this->all(
            "SELECT DATE(created_at) AS day, COUNT(DISTINCT visit) AS visits,
                    COALESCE(SUM(CASE WHEN type = 'heartbeat' THEN seconds END), 0) AS seconds
             FROM game_events WHERE app_id = ? AND created_at >= ? GROUP BY DATE(created_at) ORDER BY day",
            $params
        );

        $levels = $this->all(
            "SELECT level,
                    SUM(type = 'level_start') AS starts,
                    SUM(type = 'level_end' AND result = 'win') AS wins,
                    SUM(type = 'level_end' AND result = 'lose') AS losses,
                    SUM(type = 'level_end' AND result = 'abort') AS aborts,
                    ROUND(AVG(CASE WHEN type = 'level_end' THEN seconds END)) AS avg_seconds,
                    ROUND(AVG(CASE WHEN type = 'level_end' THEN score END)) AS avg_score,
                    MAX(CASE WHEN type = 'level_end' THEN score END) AS max_score,
                    ROUND(AVG(CASE WHEN type = 'level_end' AND result = 'win' THEN stars END), 1) AS avg_stars
             FROM game_events WHERE app_id = ? AND created_at >= ? AND level IS NOT NULL
             GROUP BY level",
            $params
        );
        foreach ($levels as &$level) {
            foreach (['starts', 'wins', 'losses', 'aborts'] as $key) {
                $level[$key] = (int) $level[$key];
            }
            $finished = $level['wins'] + $level['losses'] + $level['aborts'];
            $level['tries'] = $finished;
            $level['win_rate'] = $finished > 0 ? round($level['wins'] / $finished, 3) : null;
            $level['abort_rate'] = $finished > 0 ? round($level['aborts'] / $finished, 3) : null;
            foreach (['avg_seconds', 'avg_score', 'max_score'] as $key) {
                $level[$key] = $level[$key] === null ? null : (int) $level[$key];
            }
            $level['avg_stars'] = $level['avg_stars'] === null ? null : (float) $level['avg_stars'];
        }
        unset($level);
        usort($levels, static fn (array $a, array $b): int => strnatcmp((string) $a['level'], (string) $b['level']));

        $ranked = array_values(array_filter($levels, static fn (array $l): bool => $l['tries'] >= self::MIN_TRIES_FOR_RANKING));
        $hardest = $ranked;
        usort($hardest, static fn (array $a, array $b): int => $a['win_rate'] <=> $b['win_rate']);
        $abandoned = $ranked;
        usort($abandoned, static fn (array $a, array $b): int => $b['abort_rate'] <=> $a['abort_rate']);

        return new Response(200, [
            'apps' => $apps,
            'app' => $app,
            'days' => $days,
            'totals' => $totals,
            'daily' => array_map(static fn (array $d): array => ['day' => $d['day'], 'visits' => (int) $d['visits'], 'seconds' => (int) $d['seconds']], $daily),
            'levels' => $levels,
            'hardest' => array_slice(array_column($hardest, 'level'), 0, 3),
            'most_abandoned' => array_slice(array_column(array_filter($abandoned, static fn (array $l): bool => $l['aborts'] > 0), 'level'), 0, 3),
            'details' => $this->details($app, $since),
            'min_tries_for_ranking' => self::MIN_TRIES_FOR_RANKING,
        ]);
    }

    /**
     * Statistik eines Kontos (für „Mein Konto“ und – mit Rechten – für die Zentrale).
     * @return list<array<string, mixed>>
     */
    public function forUser(int $userId): array
    {
        $rows = $this->all(
            "SELECT e.app_id, a.name,
                    COALESCE(SUM(CASE WHEN e.type = 'heartbeat' THEN e.seconds END), 0) AS seconds,
                    SUM(e.type = 'level_end' AND e.result = 'win') AS wins,
                    SUM(e.type = 'level_end') AS finished,
                    MAX(CASE WHEN e.type = 'level_end' THEN e.score END) AS best_score,
                    MAX(e.created_at) AS last_played
             FROM game_events e JOIN apps a ON a.id = e.app_id
             WHERE e.user_id = ? GROUP BY e.app_id, a.name ORDER BY last_played DESC",
            [$userId]
        );
        return array_map(static fn (array $r): array => [
            'app_id' => $r['app_id'],
            'name' => $r['name'],
            'seconds' => (int) $r['seconds'],
            'wins' => (int) $r['wins'],
            'finished' => (int) $r['finished'],
            'best_score' => $r['best_score'] === null ? null : (int) $r['best_score'],
            'last_played' => $r['last_played'],
        ], $rows);
    }

    /** @return array<string, int> Gesamtspielzeit je Konto (für die Kontenliste) */
    public function playtimeByUser(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }
        $marks = implode(',', array_fill(0, count($userIds), '?'));
        $rows = $this->all(
            "SELECT user_id, COALESCE(SUM(seconds), 0) AS seconds FROM game_events
             WHERE type = 'heartbeat' AND user_id IN ($marks) GROUP BY user_id",
            array_values($userIds)
        );
        return array_column(array_map(static fn (array $r): array => ['id' => (int) $r['user_id'], 's' => (int) $r['seconds']], $rows), 's', 'id');
    }

    /**
     * Spieler-Trichter: Wie viele Spieler erreichen Level 1, 2, 3 … und wie viele schaffen es?
     * Zählt nur nummerierte Level (z. B. die Kampagne von Nova Bastion). Spieler mit Konto zählen einmal,
     * Gäste einmal pro Besuch (sie haben keine dauerhafte Kennung).
     * @param array<string, string> $query {app, days}
     */
    public function funnel(array $query): Response
    {
        $days = max(1, min(self::MAX_DAYS, (int) ($query['days'] ?? self::MAX_DAYS)));
        $apps = $this->pdo->query("SELECT id, name FROM apps WHERE type = 'game' ORDER BY sort_order, name")->fetchAll();
        $app = (string) ($query['app'] ?? '');
        if (!in_array($app, array_column($apps, 'id'), true)) {
            $app = $apps[0]['id'] ?? '';
        }
        $who = "COALESCE(CONCAT('u', user_id), CONCAT('v', visit))";
        $rows = $this->all(
            "SELECT level, COUNT(DISTINCT $who) AS players,
                    COUNT(DISTINCT CASE WHEN type = 'level_end' AND result = 'win' THEN $who END) AS winners
             FROM game_events
             WHERE app_id = ? AND created_at >= ? AND type IN ('level_start', 'level_end') AND level REGEXP '^[0-9]{1,3}$'
             GROUP BY level",
            [$app, $this->clock->datetime(-$days * 86400)]
        );
        $steps = array_map(static fn (array $r): array => ['level' => (int) $r['level'], 'players' => (int) $r['players'], 'winners' => (int) $r['winners']], $rows);
        usort($steps, static fn (array $a, array $b): int => $a['level'] <=> $b['level']);
        $first = $steps[0]['players'] ?? 0;
        $previous = null;
        foreach ($steps as &$step) {
            $step['win_rate'] = $step['players'] > 0 ? round($step['winners'] / $step['players'], 3) : null;
            $step['of_first'] = $first > 0 ? round($step['players'] / $first, 3) : null;
            // Wie viele der Spieler des vorigen Levels sind hier nicht mehr angekommen?
            $step['drop'] = $previous !== null && $previous > 0 ? round(max(0, $previous - $step['players']) / $previous, 3) : null;
            $previous = $step['players'];
        }
        unset($step);
        return new Response(200, ['apps' => $apps, 'app' => $app, 'days' => $days, 'steps' => $steps]);
    }

    /**
     * Kennzahlen der letzten 7 Tage im Vergleich zu den 7 Tagen davor.
     * @return array<string, array{now: int, before: int}>
     */
    public function trends(): array
    {
        $now = $this->clock->datetime();
        $week = $this->clock->datetime(-7 * 86400);
        $two = $this->clock->datetime(-14 * 86400);
        $pair = function (string $sql) use ($now, $week, $two): array {
            return ['now' => (int) $this->one($sql, [$week, $now])['v'], 'before' => (int) $this->one($sql, [$two, $week])['v']];
        };
        return [
            'players' => $pair("SELECT COUNT(DISTINCT COALESCE(CONCAT('u', user_id), CONCAT('v', visit))) AS v FROM game_events WHERE created_at >= ? AND created_at < ?"),
            'visits' => $pair('SELECT COUNT(DISTINCT visit) AS v FROM game_events WHERE created_at >= ? AND created_at < ?'),
            'seconds' => $pair("SELECT COALESCE(SUM(seconds), 0) AS v FROM game_events WHERE type = 'heartbeat' AND created_at >= ? AND created_at < ?"),
            'new_users' => $pair('SELECT COUNT(*) AS v FROM users WHERE created_at >= ? AND created_at < ?'),
            'wins' => $pair("SELECT COUNT(*) AS v FROM game_events WHERE type = 'level_end' AND result = 'win' AND created_at >= ? AND created_at < ?"),
        ];
    }

    /** Summen der Zusatzwerte (z. B. genutzte Türme) aus beendeten Leveln. @return list<array{key: string, total: int}> */
    private function details(string $app, string $since): array
    {
        $statement = $this->pdo->prepare("SELECT data FROM game_events WHERE app_id = ? AND created_at >= ? AND type = 'level_end' AND data IS NOT NULL");
        $statement->execute([$app, $since]);
        $totals = [];
        foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $json) {
            foreach (json_decode((string) $json, true) ?: [] as $key => $value) {
                $label = is_int($value) ? $key : "$key: $value";
                $totals[$label] = ($totals[$label] ?? 0) + (is_int($value) ? $value : 1);
            }
        }
        arsort($totals);
        $top = array_slice($totals, 0, 30, true);
        // Schlüssel wie „123“ macht PHP zu Zahlen – deshalb ausdrücklich als Text zurückgeben.
        return array_map(static fn ($key, $total): array => ['key' => (string) $key, 'total' => (int) $total], array_keys($top), array_values($top));
    }

    /** @param list<mixed> $params @return array<string, mixed> */
    private function one(string $sql, array $params): array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return $statement->fetch() ?: [];
    }

    /** @param list<mixed> $params @return list<array<string, mixed>> */
    private function all(string $sql, array $params): array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll();
    }
}
