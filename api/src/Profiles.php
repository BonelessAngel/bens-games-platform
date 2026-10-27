<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Spielerprofile: Spieler-Rang, Titel, Banner, angepinnte Abzeichen mit Seltenheit, eigene Community-Level
 * und – nur mit Zustimmung – der Aktivitäts-Kalender. Alles wird aus vorhandenen Daten berechnet;
 * gespeichert werden nur die Wahl von Banner, Titel und Pins sowie die Zustimmung zum Kalender.
 */
final class Profiles
{
    public const MAX_PINS = 3;
    public const ACTIVITY_DAYS = 91;

    /** Ränge: ab so vielen Punkten. */
    public const RANKS = [
        [0, 'Rekrut'], [60, 'Kadett'], [150, 'Leutnant'], [300, 'Hauptmann'],
        [500, 'Kommandant'], [800, 'Admiral'], [1200, 'Großadmiral'], [1800, 'Legende'],
    ];

    /** Titel: id => [Name, Bedingung als Text] – freigeschaltet über unlocked(). */
    public const TITLES = [
        'neuling' => ['Neuling', 'Von Anfang an dabei'],
        'sammler' => ['Sammler', '10 Erfolge'],
        'abzeichenjaeger' => ['Abzeichenjäger', '30 Erfolge'],
        'allrounder' => ['Allrounder', 'Erfolge in zwei Spielen'],
        'champion' => ['Champion', 'Einmal Platz 1 in einer Rangliste'],
        'stammgast' => ['Treppchen-Stammgast', 'Dreimal auf Platz 1–3'],
        'baumeister' => ['Baumeister', 'Ein eigenes Community-Level'],
        'architekt' => ['Architekt', '10 Daumen für deine Level'],
        'sternenjaeger' => ['Sternenjäger', '60 Sterne in Nova Bastion'],
        'unaufhaltsam' => ['Unaufhaltsam', '100 Sterne in Nova Bastion'],
        'legende' => ['Legende', 'Rang „Legende“'],
        'albummeister' => ['Albummeister', 'Ein Set im Royal-Blocks-Album komplett'],
        'glueckspilz' => ['Glückspilz', 'Hauptgewinn am Royal-Blocks-Automaten'],
        'highroller' => ['Highroller', '50.000 Chips im Royal-Blocks-Shop ausgegeben'],
    ];

    /** Banner: id => [Name, Bedingung als Text]. Aussehen: src/styles/main.css (.banner--<id>). */
    public const BANNERS = [
        'nacht' => ['Nachthimmel', 'Für alle'],
        'neon' => ['Neon', 'Für alle'],
        'aurora' => ['Polarlicht', '5 Erfolge'],
        'lava' => ['Lavastrom', '15 Erfolge'],
        'sternenstaub' => ['Sternenstaub', '30 Sterne in Nova Bastion'],
        'royal' => ['Royal Flush', '5 Erfolge in Royal Blocks'],
        'gold' => ['Goldrausch', 'Einmal Platz 1 in einer Rangliste'],
        'galaxie' => ['Galaxie', 'Rang „Admiral“'],
        'casino' => ['Casino Royale', 'Legendärer Fund in Royal Blocks'],
    ];

    /** Royal-Blocks-Erfolge, die Titel bzw. Banner freischalten (IDs aus dem Spiel, ab v1.7.0) */
    private const ROYAL_SPECIAL = ['shop_legendary', 'album_set', 'slot_jackpot', 'highroller'];

    public function __construct(private PDO $pdo, private Clock $clock, private Leaderboards $leaderboards)
    {
    }

    /** Kennzahlen, aus denen Rang, Titel und Banner folgen. @return array<string, mixed> */
    public function facts(int $userId): array
    {
        $achievements = $this->all(
            "SELECT g.app_id, COUNT(*) AS n FROM game_achievements g JOIN apps a ON a.id = g.app_id
             WHERE g.user_id = ? AND a.status <> 'private' AND a.visibility = 'all' GROUP BY g.app_id",
            [$userId]
        );
        $perApp = array_column(array_map(static fn (array $r): array => ['app' => $r['app_id'], 'n' => (int) $r['n']], $achievements), 'n', 'app');

        $boards = $this->all("SELECT app_id, board FROM leaderboard_entries WHERE user_id = ? AND period = 'all' AND hidden_at IS NULL", [$userId]);
        $ranks = array_map(fn (array $b): ?int => $this->leaderboards->rankOf($b['app_id'], $b['board'], 'all', $userId)['rank'], $boards);

        $royal = array_column($this->all(
            "SELECT achievement_id FROM game_achievements WHERE user_id = ? AND app_id = 'royal-blocks' AND achievement_id IN ("
                . implode(', ', array_fill(0, count(self::ROYAL_SPECIAL), '?')) . ')',
            [$userId, ...self::ROYAL_SPECIAL]
        ), 'achievement_id');

        $levels = $this->all('SELECT COUNT(*) AS n, COALESCE(SUM(likes), 0) AS likes FROM community_levels WHERE user_id = ? AND hidden_at IS NULL', [$userId])[0];

        $stars = 0;
        $save = $this->all("SELECT data FROM game_saves WHERE user_id = ? AND app_id = 'nova-bastion'", [$userId]);
        if ($save) {
            $camp = json_decode((string) $save[0]['data'], true)['camp'] ?? null;
            if (is_array($camp) && is_array($camp['stars'] ?? null)) {
                $stars = array_sum(array_map(static fn ($s): int => max(0, min(3, (int) $s)), $camp['stars']));
            }
        }

        $facts = [
            'achievements' => array_sum($perApp),
            'achievement_apps' => count($perApp),
            'royal_achievements' => $perApp['royal-blocks'] ?? 0,
            'royal_special' => $royal,
            'first_places' => count(array_filter($ranks, static fn (?int $r): bool => $r === 1)),
            'podiums' => count(array_filter($ranks, static fn (?int $r): bool => $r !== null && $r <= 3)),
            'boards' => count($boards),
            'levels' => (int) $levels['n'],
            'likes' => (int) $levels['likes'],
            'nova_stars' => $stars,
        ];
        $points = $facts['achievements'] * 10
            + array_sum(array_map(static fn (?int $r): int => $r === null ? 0 : ($r === 1 ? 60 : ($r <= 3 ? 30 : ($r <= 10 ? 10 : 3))), $ranks))
            + $facts['levels'] * 15 + min(200, $facts['likes'] * 2) + $facts['nova_stars'];
        $facts['points'] = $points;
        $facts['rank'] = self::rank($points);
        return $facts;
    }

    /** @return array{name: string, level: int, points: int, next: ?string, next_points: ?int, progress: float} */
    public static function rank(int $points): array
    {
        $level = 0;
        foreach (self::RANKS as $i => [$from]) {
            if ($points >= $from) {
                $level = $i;
            }
        }
        $next = self::RANKS[$level + 1] ?? null;
        $from = self::RANKS[$level][0];
        return [
            'name' => self::RANKS[$level][1],
            'level' => $level + 1,
            'points' => $points,
            'next' => $next[1] ?? null,
            'next_points' => $next[0] ?? null,
            'progress' => $next === null ? 1.0 : round(($points - $from) / ($next[0] - $from), 3),
        ];
    }

    /** @param array<string, mixed> $f @return array{titles: list<string>, banners: list<string>} */
    public static function unlocked(array $f): array
    {
        $rank = (int) $f['rank']['level'];
        $titles = array_keys(array_filter([
            'neuling' => true,
            'sammler' => $f['achievements'] >= 10,
            'abzeichenjaeger' => $f['achievements'] >= 30,
            'allrounder' => $f['achievement_apps'] >= 2,
            'champion' => $f['first_places'] >= 1,
            'stammgast' => $f['podiums'] >= 3,
            'baumeister' => $f['levels'] >= 1,
            'architekt' => $f['likes'] >= 10,
            'sternenjaeger' => $f['nova_stars'] >= 60,
            'unaufhaltsam' => $f['nova_stars'] >= 100,
            'legende' => $rank >= 8,
            'albummeister' => in_array('album_set', $f['royal_special'] ?? [], true),
            'glueckspilz' => in_array('slot_jackpot', $f['royal_special'] ?? [], true),
            'highroller' => in_array('highroller', $f['royal_special'] ?? [], true),
        ]));
        $banners = array_keys(array_filter([
            'nacht' => true,
            'neon' => true,
            'aurora' => $f['achievements'] >= 5,
            'lava' => $f['achievements'] >= 15,
            'sternenstaub' => $f['nova_stars'] >= 30,
            'royal' => $f['royal_achievements'] >= 5,
            'gold' => $f['first_places'] >= 1,
            'galaxie' => $rank >= 6,
            'casino' => in_array('shop_legendary', $f['royal_special'] ?? [], true),
        ]));
        return ['titles' => $titles, 'banners' => $banners];
    }

    /** Für „Mein Konto“: alle Titel und Banner (frei oder mit Bedingung), eigene Erfolge und die aktuelle Wahl. @param array<string, mixed> $session */
    public function options(array $session): Response
    {
        $userId = (int) $session['id'];
        $facts = $this->facts($userId);
        $open = self::unlocked($facts);
        $current = $this->settings($userId);
        $list = static fn (array $all, array $free): array => array_map(
            static fn (string $id, array $def): array => ['id' => $id, 'name' => $def[0], 'condition' => $def[1], 'unlocked' => in_array($id, $free, true)],
            array_keys($all),
            array_values($all),
        );
        $owned = $this->all(
            "SELECT g.app_id, a.name, g.achievement_id FROM game_achievements g JOIN apps a ON a.id = g.app_id
             WHERE g.user_id = ? AND a.status <> 'private' AND a.visibility = 'all' ORDER BY a.sort_order, g.unlocked_at",
            [$userId]
        );
        return new Response(200, [
            'rank' => $facts['rank'],
            'titles' => $list(self::TITLES, $open['titles']),
            'banners' => $list(self::BANNERS, $open['banners']),
            'achievements' => array_map(static fn (array $a): array => ['app_id' => $a['app_id'], 'app' => $a['name'], 'id' => $a['achievement_id']], $owned),
            'current' => $current,
        ]);
    }

    /**
     * Banner, Titel, Pins und Kalender speichern. Nur Freigeschaltetes und eigene Erfolge sind erlaubt.
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input {banner, title, pins: list<string "app:id">, activity: bool}
     */
    public function save(array $session, array $input): Response
    {
        $userId = (int) $session['id'];
        $open = self::unlocked($this->facts($userId));
        $banner = $input['banner'] ?? null;
        $title = $input['title'] ?? null;
        $pins = $input['pins'] ?? [];
        $activity = $input['activity'] ?? false;
        if (!is_array($pins) || !is_bool($activity) || ($banner !== null && !is_string($banner)) || ($title !== null && !is_string($title))) {
            throw new HttpError(422, 'validation');
        }
        if ($banner !== null && !in_array($banner, $open['banners'], true)) {
            throw new HttpError(422, 'validation', ['fields' => ['banner' => 'Dieses Banner ist noch nicht freigeschaltet.']]);
        }
        if ($title !== null && !in_array($title, $open['titles'], true)) {
            throw new HttpError(422, 'validation', ['fields' => ['title' => 'Dieser Titel ist noch nicht freigeschaltet.']]);
        }
        $pins = array_values(array_unique(array_filter($pins, 'is_string')));
        if (count($pins) > self::MAX_PINS) {
            throw new HttpError(422, 'validation', ['fields' => ['pins' => 'Höchstens 3 Abzeichen anpinnen.']]);
        }
        $check = $this->pdo->prepare('SELECT 1 FROM game_achievements WHERE user_id = ? AND app_id = ? AND achievement_id = ?');
        foreach ($pins as $pin) {
            [$app, $id] = array_pad(explode(':', $pin, 2), 2, '');
            $check->execute([$userId, $app, $id]);
            if (!$check->fetchColumn()) {
                throw new HttpError(422, 'validation', ['fields' => ['pins' => 'Nur eigene Erfolge können angepinnt werden.']]);
            }
        }
        $this->pdo->prepare('UPDATE users SET profile_banner = ?, profile_title = ?, profile_pins = ?, profile_activity = ? WHERE id = ?')
            ->execute([$banner, $title, $pins === [] ? null : json_encode($pins), $activity ? 1 : 0, $userId]);
        return new Response(200, ['status' => 'saved', 'current' => $this->settings($userId)]);
    }

    /**
     * Zusatzteile für das öffentliche Profil. Gewählte Titel/Banner gelten nur, solange sie freigeschaltet sind.
     * @return array<string, mixed>
     */
    public function publicParts(int $userId): array
    {
        $facts = $this->facts($userId);
        $open = self::unlocked($facts);
        $settings = $this->settings($userId);
        $title = in_array($settings['title'], $open['titles'], true) ? $settings['title'] : null;
        $banner = in_array($settings['banner'], $open['banners'], true) ? $settings['banner'] : 'nacht';

        return [
            'rank' => $facts['rank'],
            'title' => $title === null ? null : ['id' => $title, 'name' => self::TITLES[$title][0]],
            'banner' => $banner,
            'pins' => $settings['pins'],
            'rarity' => $this->rarity($userId),
            'stats' => [
                'achievements' => $facts['achievements'],
                'first_places' => $facts['first_places'],
                'podiums' => $facts['podiums'],
                'levels' => $facts['levels'],
                'nova_stars' => $facts['nova_stars'],
            ],
            'levels' => $this->levels($userId),
            'activity' => $settings['activity'] && !$this->statsOptOut($userId) ? $this->activity($userId) : null,
        ];
    }

    /** @return array{banner: ?string, title: ?string, pins: list<string>, activity: bool} */
    private function settings(int $userId): array
    {
        $row = $this->all('SELECT profile_banner, profile_title, profile_pins, profile_activity FROM users WHERE id = ?', [$userId])[0] ?? [];
        $pins = json_decode((string) ($row['profile_pins'] ?? ''), true);
        return [
            'banner' => $row['profile_banner'] ?? null,
            'title' => $row['profile_title'] ?? null,
            'pins' => is_array($pins) ? array_values(array_filter($pins, 'is_string')) : [],
            'activity' => (bool) ($row['profile_activity'] ?? false),
        ];
    }

    /** Wie viel Prozent der Spieler eines Spiels haben jeden der eigenen Erfolge? @return array<string, float> "app:id" => Anteil */
    private function rarity(int $userId): array
    {
        $rows = $this->all(
            "SELECT mine.app_id, mine.achievement_id,
                    (SELECT COUNT(*) FROM game_achievements o WHERE o.app_id = mine.app_id AND o.achievement_id = mine.achievement_id) AS holders,
                    (SELECT COUNT(DISTINCT p.user_id) FROM game_achievements p WHERE p.app_id = mine.app_id) AS players
             FROM game_achievements mine WHERE mine.user_id = ?",
            [$userId]
        );
        $out = [];
        foreach ($rows as $row) {
            $out[$row['app_id'] . ':' . $row['achievement_id']] = (int) $row['players'] > 0 ? round((int) $row['holders'] / (int) $row['players'], 3) : 1.0;
        }
        return $out;
    }

    /** @return list<array<string, mixed>> */
    private function levels(int $userId): array
    {
        return array_map(static fn (array $l): array => [
            'id' => (int) $l['id'], 'app_id' => $l['app_id'], 'app' => $l['app'], 'name' => $l['name'],
            'plays' => (int) $l['plays'], 'wins' => (int) $l['wins'], 'likes' => (int) $l['likes'], 'created_at' => $l['created_at'],
        ], $this->all(
            "SELECT l.id, l.app_id, a.name AS app, l.name, l.plays, l.wins, l.likes, l.created_at
             FROM community_levels l JOIN apps a ON a.id = l.app_id
             WHERE l.user_id = ? AND l.hidden_at IS NULL ORDER BY l.likes DESC, l.created_at DESC LIMIT 12",
            [$userId]
        ));
    }

    /** Aktivität der letzten 91 Tage: Minuten pro Tag, Lieblingsspiel, Gesamtzeit. @return array<string, mixed> */
    private function activity(int $userId): array
    {
        $since = $this->clock->datetime(-self::ACTIVITY_DAYS * 86400);
        $days = $this->all(
            "SELECT DATE(created_at) AS day, SUM(seconds) AS seconds FROM game_events
             WHERE user_id = ? AND type = 'heartbeat' AND created_at >= ? GROUP BY DATE(created_at)",
            [$userId, $since]
        );
        $games = $this->all(
            "SELECT e.app_id, a.name, a.icon, SUM(e.seconds) AS seconds FROM game_events e JOIN apps a ON a.id = e.app_id
             WHERE e.user_id = ? AND e.type = 'heartbeat' AND e.created_at >= ? AND a.visibility = 'all' AND a.status <> 'private'
             GROUP BY e.app_id, a.name, a.icon ORDER BY seconds DESC LIMIT 1",
            [$userId, $since]
        );
        $map = [];
        foreach ($days as $d) {
            $map[(string) $d['day']] = (int) round((int) $d['seconds'] / 60);
        }
        return [
            'from' => gmdate('Y-m-d', $this->clock->now() - (self::ACTIVITY_DAYS - 1) * 86400),
            'to' => gmdate('Y-m-d', $this->clock->now()),
            'minutes' => $map,
            'total_minutes' => array_sum($map),
            'active_days' => count(array_filter($map)),
            'favorite' => $games ? ['id' => $games[0]['app_id'], 'name' => $games[0]['name'], 'icon' => $games[0]['icon']] : null,
        ];
    }

    private function statsOptOut(int $userId): bool
    {
        return (bool) ($this->all('SELECT stats_opt_out FROM users WHERE id = ?', [$userId])[0]['stats_opt_out'] ?? true);
    }

    /** @param list<mixed> $params @return list<array<string, mixed>> */
    private function all(string $sql, array $params): array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll();
    }
}
