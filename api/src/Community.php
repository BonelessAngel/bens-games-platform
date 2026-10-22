<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Community-Funktionen (Phase 6): „Weiterspielen“ auf der Startseite und öffentliche Spielerprofile.
 *
 * Ein Profil zeigt nur, was über die Ranglisten ohnehin öffentlich ist (Name, Profilbild, Bestwerte und Plätze),
 * dazu Beitrittsmonat und Erfolge. Gesperrte Konten und Konten mit Widerspruch gegen Ranglisten haben kein Profil.
 */
final class Community
{
    public const RECENT = 4;

    public function __construct(private PDO $pdo, private Leaderboards $leaderboards)
    {
    }

    /**
     * Zuletzt gespielte Spiele dieses Kontos (aus Spielständen und Spielstatistik), nur sichtbare Apps.
     * @param array<string, mixed> $session
     */
    public function recent(array $session, AppCatalog $catalog): Response
    {
        $userId = (int) $session['id'];
        $statement = $this->pdo->prepare(
            "SELECT app_id, MAX(t) AS last_played FROM (
               SELECT app_id, updated_at AS t FROM game_saves WHERE user_id = ?
               UNION ALL
               SELECT app_id, MAX(created_at) AS t FROM game_events WHERE user_id = ? GROUP BY app_id
             ) x GROUP BY app_id ORDER BY last_played DESC"
        );
        $statement->execute([$userId, $userId]);
        $visible = [];
        foreach ($catalog->visibleFor($userId) as $app) {
            $visible[$app['id']] = $app;
        }
        $best = $this->pdo->prepare(
            "SELECT board, score FROM leaderboard_entries WHERE user_id = ? AND app_id = ? AND period = 'all' ORDER BY score DESC LIMIT 1"
        );
        $games = [];
        foreach ($statement->fetchAll() as $row) {
            $app = $visible[$row['app_id']] ?? null;
            if ($app === null || $app['status'] === 'maintenance') {
                continue;
            }
            $best->execute([$userId, $app['id']]);
            $top = $best->fetch();
            $games[] = [
                'id' => $app['id'],
                'name' => $app['name'],
                'icon' => $app['icon'],
                'path' => $app['path'],
                'last_played' => $row['last_played'],
                'best' => $top ? ['board' => $top['board'], 'score' => (int) $top['score']] : null,
            ];
            if (count($games) === self::RECENT) {
                break;
            }
        }
        return new Response(200, ['games' => $games]);
    }

    /**
     * Öffentliches Profil nach Anzeigename.
     * @param array<string, string> $query {name}
     * @param array<string, mixed>|null $session
     */
    public function profile(array $query, ?array $session): Response
    {
        $name = trim((string) ($query['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 40) {
            throw new HttpError(404, 'not_found');
        }
        $statement = $this->pdo->prepare(
            "SELECT id, display_name, avatar, avatar_color, created_at FROM users
             WHERE display_name = ? AND status = 'active' AND leaderboard_opt_out = 0 AND email_verified_at IS NOT NULL"
        );
        $statement->execute([$name]);
        $user = $statement->fetch();
        if (!$user) {
            throw new HttpError(404, 'not_found');
        }
        $userId = (int) $user['id'];

        $entries = $this->pdo->prepare(
            "SELECT l.app_id, a.name, a.icon, l.board, l.score, l.achieved_at
             FROM leaderboard_entries l JOIN apps a ON a.id = l.app_id
             WHERE l.user_id = ? AND l.period = 'all' AND l.hidden_at IS NULL
               AND a.status <> 'private' AND a.visibility = 'all'
             ORDER BY a.sort_order, l.app_id, l.board"
        );
        $entries->execute([$userId]);
        $games = [];
        foreach ($entries->fetchAll() as $row) {
            $id = $row['app_id'];
            $games[$id] ??= ['id' => $id, 'name' => $row['name'], 'icon' => $row['icon'], 'boards' => [], 'achievements' => []];
            $games[$id]['boards'][] = [
                'board' => $row['board'],
                'score' => (int) $row['score'],
                'rank' => $this->leaderboards->rankOf($id, $row['board'], 'all', $userId)['rank'],
                'achieved_at' => $row['achieved_at'],
            ];
        }
        foreach ($this->achievements($userId) as $row) {
            $id = $row['app_id'];
            $games[$id] ??= ['id' => $id, 'name' => $row['name'], 'icon' => $row['icon'], 'boards' => [], 'achievements' => []];
            $games[$id]['achievements'][] = $row['achievement_id'];
        }
        foreach ($games as &$game) {
            usort($game['boards'], static fn (array $a, array $b): int => strnatcmp($a['board'], $b['board']));
        }
        unset($game);

        return new Response(200, ['profile' => [
            'display_name' => $user['display_name'],
            'avatar' => $user['avatar'],
            'avatar_color' => $user['avatar_color'],
            'member_since' => substr((string) $user['created_at'], 0, 7),
            'me' => $session !== null && (int) $session['id'] === $userId,
            'games' => array_values($games),
        ]]);
    }

    /**
     * Alles für den Startbildschirm eines Spiels in einer Anfrage (docs/spiele-anbindung.md):
     * wer angemeldet ist, die besten eigenen Plätze, Ankündigungen für dieses Spiel und die passenden Links.
     * @param array<string, mixed>|null $session
     */
    public function hub(string $appId, ?array $session, Announcements $announcements): Response
    {
        $statement = $this->pdo->prepare("SELECT 1 FROM apps WHERE id = ? AND type = 'game'");
        $statement->execute([$appId]);
        if (!$statement->fetchColumn()) {
            throw new HttpError(404, 'unknown_game');
        }

        $user = null;
        $best = [];
        if ($session !== null) {
            $userId = (int) $session['id'];
            $listed = empty($session['leaderboard_opt_out']);
            $user = [
                'display_name' => $session['display_name'],
                'initial' => mb_strtoupper(mb_substr(trim((string) $session['display_name']), 0, 1)),
                'avatar_url' => $session['avatar'] !== null ? "/avatars/{$session['avatar']}-{$session['avatar_color']}.svg" : null,
                'listed' => $listed,
                'profile_url' => $listed ? '/spieler/?name=' . rawurlencode((string) $session['display_name']) : null,
            ];
            $entries = $this->pdo->prepare("SELECT board, score FROM leaderboard_entries WHERE user_id = ? AND app_id = ? AND period = 'all' AND hidden_at IS NULL");
            $entries->execute([$userId, $appId]);
            foreach ($entries->fetchAll() as $row) {
                $best[] = [
                    'board' => $row['board'],
                    'score' => (int) $row['score'],
                    'rank' => $listed ? $this->leaderboards->rankOf($appId, $row['board'], 'all', $userId)['rank'] : null,
                ];
            }
            // Beste Plätze zuerst, höchstens drei.
            usort($best, static fn (array $a, array $b): int => [$a['rank'] ?? PHP_INT_MAX, -$a['score']] <=> [$b['rank'] ?? PHP_INT_MAX, -$b['score']]);
            $best = array_slice($best, 0, 3);
        }

        $return = rawurlencode("/games/$appId/");
        return new Response(200, [
            'user' => $user,
            'best' => $best,
            'announcements' => $announcements->active($appId, $session)->body['announcements'],
            'links' => [
                'website' => '/',
                'rankings' => '/ranglisten/?spiel=' . $appId,
                'login' => "/konto/anmelden/?zurueck=$return",
                'register' => "/konto/registrieren/?zurueck=$return",
                'account' => '/konto/',
            ],
        ]);
    }

    /** @return list<array<string, string>> */
    private function achievements(int $userId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT g.app_id, a.name, a.icon, g.achievement_id FROM game_achievements g JOIN apps a ON a.id = g.app_id
             WHERE g.user_id = ? AND a.status <> 'private' AND a.visibility = 'all'
             ORDER BY a.sort_order, g.app_id, g.unlocked_at, g.achievement_id"
        );
        $statement->execute([$userId]);
        return $statement->fetchAll();
    }
}
