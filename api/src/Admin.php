<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Zentrale, Stufe 1 (Phase 5a): Übersicht, Konten, Rechte, Protokoll.
 * Läuft nur unter admin.bens-games.de (config role = admin). Jede Aktion prüft ein einzelnes Recht
 * und landet im Protokoll. Passwörter sind nie sichtbar, E-Mail-Adressen nur mit users.view_email.
 */
final class Admin
{
    private const PAGE_SIZE = 50;

    public function __construct(
        private PDO $pdo,
        private Clock $clock,
        private Permissions $permissions,
        private Sessions $sessions,
        private AuditLog $audit,
        private GameStats $stats,
    ) {
    }

    /**
     * Auswertung eines Spiels (Spielzeit, Besuche, Level, Punkte, Zusatzwerte).
     * @param array<string, mixed> $session
     * @param array<string, string> $query {app, days}
     */
    public function games(array $session, array $query): Response
    {
        $this->require($session, 'stats.view');
        return $this->stats->report($query);
    }

    /**
     * Apps, die dieses Konto verwalten darf (app.<id>.manage oder Besitzer), mit Status, Sichtbarkeit und Freigaben.
     * @param array<string, mixed> $session
     */
    public function apps(array $session): Response
    {
        $apps = array_values(array_filter(
            $this->pdo->query('SELECT id, name, type, status, visibility, version, path FROM apps ORDER BY sort_order, name')->fetchAll(),
            fn (array $app): bool => $this->canManageApp($session, $app['id']),
        ));
        $access = $this->pdo->prepare(
            'SELECT u.id, u.display_name, x.created_at FROM app_access x JOIN users u ON u.id = x.user_id WHERE x.app_id = ? ORDER BY u.display_name'
        );
        foreach ($apps as &$app) {
            $access->execute([$app['id']]);
            $app['access'] = $access->fetchAll();
        }
        unset($app);
        return new Response(200, ['apps' => $apps, 'statuses' => ['public', 'beta', 'private', 'maintenance'], 'visibilities' => ['all', 'signed_in', 'selected']]);
    }

    /**
     * Status und Sichtbarkeit einer App ändern (z. B. Wartungsmodus).
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input {id, status, visibility}
     */
    public function updateApp(array $session, array $input, Request $request): Response
    {
        $appId = (string) ($input['id'] ?? '');
        $this->requireApp($session, $appId);
        $status = (string) ($input['status'] ?? '');
        $visibility = (string) ($input['visibility'] ?? '');
        if (!in_array($status, ['public', 'beta', 'private', 'maintenance'], true) || !in_array($visibility, ['all', 'signed_in', 'selected'], true)) {
            throw new HttpError(422, 'validation');
        }
        $this->pdo->prepare('UPDATE apps SET status = ?, visibility = ?, updated_at = ? WHERE id = ?')
            ->execute([$status, $visibility, $this->clock->datetime(), $appId]);
        $this->audit->log('admin.app_updated', $request, actorUserId: (int) $session['id'], targetType: 'app', targetId: $appId, details: ['status' => $status, 'visibility' => $visibility]);
        return new Response(200, ['status' => $status, 'visibility' => $visibility]);
    }

    /**
     * Ein Konto (per Anzeigename) für eine App freischalten oder die Freigabe entziehen.
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input {app_id, display_name, grant: bool}
     */
    public function setAppAccess(array $session, array $input, Request $request): Response
    {
        $appId = (string) ($input['app_id'] ?? '');
        $this->requireApp($session, $appId);
        $statement = $this->pdo->prepare('SELECT id FROM users WHERE display_name = ?');
        $statement->execute([trim((string) ($input['display_name'] ?? ''))]);
        $userId = (int) $statement->fetchColumn();
        if ($userId === 0) {
            throw new HttpError(404, 'unknown_user');
        }
        $grant = ($input['grant'] ?? null) === true;
        if ($grant) {
            $this->pdo->prepare('INSERT IGNORE INTO app_access (user_id, app_id, created_at) VALUES (?, ?, ?)')->execute([$userId, $appId, $this->clock->datetime()]);
        } else {
            $this->pdo->prepare('DELETE FROM app_access WHERE user_id = ? AND app_id = ?')->execute([$userId, $appId]);
        }
        $this->audit->log($grant ? 'admin.app_access_granted' : 'admin.app_access_revoked', $request, actorUserId: (int) $session['id'], targetType: 'app', targetId: $appId, details: ['user' => $userId]);
        return new Response(200, ['granted' => $grant, 'user_id' => $userId]);
    }

    /** Ranglisten moderieren (Recht „moderation“). @param array<string, mixed> $session @param array<string, string> $query */
    public function leaderboard(array $session, array $query, Leaderboards $leaderboards): Response
    {
        $this->require($session, 'moderation');
        return $leaderboards->moderationList($query);
    }

    /** @param array<string, mixed> $session @param array<string, mixed> $input */
    public function hideScore(array $session, array $input, Request $request, Leaderboards $leaderboards): Response
    {
        $this->require($session, 'moderation');
        return $leaderboards->setHidden($session, $input, $request);
    }

    /** @param array<string, mixed> $session */
    private function canManageApp(array $session, string $appId): bool
    {
        return $this->permissions->has((int) $session['id'], "app.$appId.manage");
    }

    /** @param array<string, mixed> $session */
    private function requireApp(array $session, string $appId): void
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM apps WHERE id = ?');
        $statement->execute([$appId]);
        if (!$statement->fetchColumn()) {
            throw new HttpError(404, 'unknown_app');
        }
        if (!$this->canManageApp($session, $appId)) {
            throw new HttpError(403, 'missing_permission', ['permission' => "app.$appId.manage"]);
        }
    }

    /**
     * Statistik eines einzelnen Kontos – nur mit stats.view und users.view.
     * @param array<string, mixed> $session
     * @param array<string, string> $query {id}
     */
    public function userStats(array $session, array $query): Response
    {
        $this->require($session, 'stats.view');
        $this->require($session, 'users.view');
        $target = (int) ($query['id'] ?? 0);
        $this->assertUserExists($target);
        return new Response(200, ['user_id' => $target, 'games' => $this->stats->forUser($target)]);
    }

    /** Wer bin ich in der Zentrale, was darf ich? @param array<string, mixed> $session */
    public function me(array $session): Response
    {
        $userId = (int) $session['id'];
        return new Response(200, [
            'user' => ['id' => $userId, 'display_name' => $session['display_name']],
            'roles' => $this->permissions->roles($userId),
            'permissions' => $this->permissions->effective($userId),
            'csrf' => $session['csrf_token'],
        ]);
    }

    /** @param array<string, mixed> $session */
    public function overview(array $session): Response
    {
        $this->require($session, 'stats.view');
        $today = gmdate('Y-m-d 00:00:00', $this->clock->now());
        $week = $this->clock->datetime(-7 * 86400);
        $day = $this->clock->datetime(-86400);
        $now = $this->clock->datetime();

        return new Response(200, [
            'users' => [
                'total' => $this->count('SELECT COUNT(*) FROM users'),
                'verified' => $this->count('SELECT COUNT(*) FROM users WHERE email_verified_at IS NOT NULL'),
                'new_today' => $this->count('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$today]),
                'new_7_days' => $this->count('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$week]),
                'two_factor' => $this->count('SELECT COUNT(*) FROM users WHERE totp_enabled_at IS NOT NULL'),
                'locked' => $this->count("SELECT COUNT(*) FROM users WHERE status = 'locked'"),
            ],
            'active_users_24h' => $this->count(
                "SELECT COUNT(DISTINCT user_id) FROM sessions WHERE scope = 'site' AND last_seen_at >= ?",
                [$day]
            ),
            'open_sessions' => $this->count(
                "SELECT COUNT(*) FROM sessions WHERE scope = 'site' AND revoked_at IS NULL AND expires_at > ?",
                [$now]
            ),
            'saves_by_game' => $this->pdo->query(
                'SELECT a.id, a.name, COUNT(s.user_id) AS saves FROM apps a LEFT JOIN game_saves s ON s.app_id = a.id
                 WHERE a.type = \'game\' GROUP BY a.id, a.name ORDER BY saves DESC, a.name'
            )->fetchAll(),
            'failed_logins_24h' => $this->count("SELECT COUNT(*) FROM audit_log WHERE action = 'user.login_failed' AND created_at >= ?", [$day]),
        ]);
    }

    /**
     * Kontenliste mit Suche nach Name (oder E-Mail mit users.view_email).
     * @param array<string, mixed> $session
     * @param array<string, string> $query
     */
    public function users(array $session, array $query): Response
    {
        $this->require($session, 'users.view');
        $withEmail = $this->permissions->has((int) $session['id'], 'users.view_email');
        $search = trim((string) ($query['q'] ?? ''));
        $page = max(1, (int) ($query['page'] ?? 1));

        $where = '';
        $params = [];
        if ($search !== '') {
            $like = '%' . addcslashes($search, '%_\\') . '%';
            $where = $withEmail ? 'WHERE (display_name LIKE ? OR email_normalized LIKE ?)' : 'WHERE display_name LIKE ?';
            $params = $withEmail ? [$like, mb_strtolower($like)] : [$like];
        }

        $total = $this->count("SELECT COUNT(*) FROM users $where", $params);
        $statement = $this->pdo->prepare(
            "SELECT id, email, display_name, status, email_verified_at, totp_enabled_at, created_at, last_login_at
             FROM users $where ORDER BY created_at DESC LIMIT " . self::PAGE_SIZE . ' OFFSET ' . (($page - 1) * self::PAGE_SIZE)
        );
        $statement->execute($params);

        $users = array_map(function (array $row) use ($withEmail): array {
            $id = (int) $row['id'];
            $user = [
                'id' => $id,
                'display_name' => $row['display_name'],
                'status' => $row['status'],
                'email_verified' => $row['email_verified_at'] !== null,
                'two_factor' => $row['totp_enabled_at'] !== null,
                'created_at' => $row['created_at'],
                'last_login_at' => $row['last_login_at'],
                'roles' => $this->permissions->roles($id),
            ];
            if ($withEmail) {
                $user['email'] = $row['email'];
            }
            return $user;
        }, $statement->fetchAll());

        // Spielzeit der letzten 90 Tage nur zusammen mit dem Recht für Statistik.
        if ($this->permissions->has((int) $session['id'], 'stats.view')) {
            $playtime = $this->stats->playtimeByUser(array_column($users, 'id'));
            foreach ($users as &$user) {
                $user['playtime_seconds'] = $playtime[$user['id']] ?? 0;
            }
            unset($user);
        }

        return new Response(200, ['users' => $users, 'total' => $total, 'page' => $page, 'page_size' => self::PAGE_SIZE]);
    }

    /**
     * Konto sperren oder entsperren. Gesperrte Konten werden sofort überall abgemeldet.
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input {id, locked: bool}
     */
    public function lock(array $session, array $input, Request $request): Response
    {
        $this->require($session, 'users.manage');
        $target = $this->target($session, $input);
        $locked = ($input['locked'] ?? null) === true;
        $this->pdo->prepare('UPDATE users SET status = ? WHERE id = ?')->execute([$locked ? 'locked' : 'active', $target]);
        if ($locked) {
            $this->sessions->revokeAll($target);
        }
        $this->audit->log($locked ? 'admin.user_locked' : 'admin.user_unlocked', $request, actorUserId: (int) $session['id'], targetType: 'user', targetId: (string) $target);
        return new Response(200, ['status' => $locked ? 'locked' : 'active']);
    }

    /**
     * Alle Sitzungen eines Kontos beenden (Webseite und Zentrale).
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input {id}
     */
    public function revokeSessions(array $session, array $input, Request $request): Response
    {
        $this->require($session, 'users.manage');
        $target = $this->target($session, $input);
        $count = $this->sessions->revokeAll($target);
        $this->audit->log('admin.sessions_revoked', $request, actorUserId: (int) $session['id'], targetType: 'user', targetId: (string) $target, details: ['count' => $count]);
        return new Response(200, ['status' => 'revoked', 'count' => $count]);
    }

    /**
     * Rechte eines Kontos und alles, was vergeben werden kann.
     * @param array<string, mixed> $session
     * @param array<string, string> $query {id}
     */
    public function rights(array $session, array $query): Response
    {
        $this->require($session, 'roles.manage');
        $target = (int) ($query['id'] ?? 0);
        $this->assertUserExists($target);
        $apps = $this->pdo->query('SELECT id, name FROM apps ORDER BY sort_order, name')->fetchAll();

        return new Response(200, [
            'user_id' => $target,
            'roles' => $this->permissions->roles($target),
            'permissions' => $this->permissions->direct($target),
            'effective' => $this->permissions->effective($target),
            'available' => [
                'roles' => array_map(
                    static fn (string $id, array $role): array => ['id' => $id, 'name' => $role['name'], 'permissions' => $role['permissions']],
                    array_keys(array_diff_key(Permissions::ROLES, array_flip(Permissions::NOT_GRANTABLE_ROLES))),
                    array_values(array_diff_key(Permissions::ROLES, array_flip(Permissions::NOT_GRANTABLE_ROLES))),
                ),
                'permissions' => array_map(
                    static fn (string $id, string $label): array => ['id' => $id, 'label' => $label],
                    array_keys(array_diff_key(Permissions::ALL, array_flip(Permissions::NOT_GRANTABLE_PERMISSIONS))),
                    array_values(array_diff_key(Permissions::ALL, array_flip(Permissions::NOT_GRANTABLE_PERMISSIONS))),
                ),
                'apps' => $apps,
            ],
        ]);
    }

    /**
     * Rollen und Einzelrechte eines Kontos festlegen (nur mit roles.manage, nie für sich selbst,
     * nie „owner“ oder „roles.manage“).
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input {id, roles: list<string>, permissions: list<string>}
     */
    public function setRights(array $session, array $input, Request $request): Response
    {
        $this->require($session, 'roles.manage');
        $target = (int) ($input['id'] ?? 0);
        $this->assertUserExists($target);
        if ($target === (int) $session['id']) {
            throw new HttpError(403, 'not_on_self');
        }
        if ($this->permissions->isOwner($target)) {
            throw new HttpError(403, 'owner_protected');
        }

        $roles = is_array($input['roles'] ?? null) ? array_values(array_unique($input['roles'])) : null;
        $perms = is_array($input['permissions'] ?? null) ? array_values(array_unique($input['permissions'])) : null;
        if ($roles === null || $perms === null) {
            throw new HttpError(422, 'validation');
        }
        foreach ($roles as $role) {
            if (!is_string($role) || !isset(Permissions::ROLES[$role]) || in_array($role, Permissions::NOT_GRANTABLE_ROLES, true)) {
                throw new HttpError(422, 'validation', ['fields' => ['roles' => "Rolle nicht erlaubt: $role"]]);
            }
        }
        foreach ($perms as $permission) {
            if (!is_string($permission) || !Permissions::isValidPermission($permission) || in_array($permission, Permissions::NOT_GRANTABLE_PERMISSIONS, true)) {
                throw new HttpError(422, 'validation', ['fields' => ['permissions' => "Recht nicht erlaubt: $permission"]]);
            }
        }

        $before = ['roles' => $this->permissions->roles($target), 'permissions' => $this->permissions->direct($target)];
        $now = $this->clock->datetime();
        $actor = (int) $session['id'];
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$target]);
            $this->pdo->prepare('DELETE FROM user_permissions WHERE user_id = ?')->execute([$target]);
            $insertRole = $this->pdo->prepare('INSERT INTO user_roles (user_id, role, granted_at, granted_by) VALUES (?, ?, ?, ?)');
            foreach ($roles as $role) {
                $insertRole->execute([$target, $role, $now, $actor]);
            }
            $insertPermission = $this->pdo->prepare('INSERT INTO user_permissions (user_id, permission, granted_at, granted_by) VALUES (?, ?, ?, ?)');
            foreach ($perms as $permission) {
                $insertPermission->execute([$target, $permission, $now, $actor]);
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        // Wer Rechte verliert, wird aus der Zentrale abgemeldet.
        if (!$this->permissions->canEnterPanel($target)) {
            $this->pdo->prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND scope = 'admin' AND revoked_at IS NULL")->execute([$now, $target]);
        }
        $this->audit->log('admin.rights_changed', $request, actorUserId: $actor, targetType: 'user', targetId: (string) $target, details: [
            'before' => implode(',', array_merge($before['roles'], $before['permissions'])),
            'after' => implode(',', array_merge($roles, $perms)),
        ]);

        return new Response(200, ['roles' => $roles, 'permissions' => $perms, 'effective' => $this->permissions->effective($target)]);
    }

    /**
     * Protokoll, neueste zuerst, optional nach Aktion gefiltert.
     * @param array<string, mixed> $session
     * @param array<string, string> $query
     */
    public function audit(array $session, array $query): Response
    {
        $this->require($session, 'audit.view');
        $page = max(1, (int) ($query['page'] ?? 1));
        $action = (string) ($query['action'] ?? '');
        $where = preg_match('/^[a-z0-9_.]{1,64}$/', $action) ? 'WHERE l.action LIKE ?' : '';
        $params = $where === '' ? [] : [str_replace('*', '%', $action) . (str_contains($action, '.') ? '' : '.%')];

        $statement = $this->pdo->prepare(
            "SELECT l.id, l.created_at, l.action, l.actor_user_id, a.display_name AS actor_name, l.target_type, l.target_id, l.ip_prefix, l.details
             FROM audit_log l LEFT JOIN users a ON a.id = l.actor_user_id
             $where ORDER BY l.id DESC LIMIT " . self::PAGE_SIZE . ' OFFSET ' . (($page - 1) * self::PAGE_SIZE)
        );
        $statement->execute($params);
        return new Response(200, ['entries' => $statement->fetchAll(), 'page' => $page, 'page_size' => self::PAGE_SIZE]);
    }

    /** @param array<string, mixed> $session */
    private function require(array $session, string $permission): void
    {
        if (!$this->permissions->has((int) $session['id'], $permission)) {
            throw new HttpError(403, 'missing_permission', ['permission' => $permission]);
        }
    }

    /**
     * Ziel-Konto für Kontoaktionen: nie man selbst, nie der Besitzer.
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input
     */
    private function target(array $session, array $input): int
    {
        $target = (int) ($input['id'] ?? 0);
        $this->assertUserExists($target);
        if ($target === (int) $session['id']) {
            throw new HttpError(403, 'not_on_self');
        }
        if ($this->permissions->isOwner($target)) {
            throw new HttpError(403, 'owner_protected');
        }
        return $target;
    }

    private function assertUserExists(int $id): void
    {
        if ($id <= 0 || $this->count('SELECT COUNT(*) FROM users WHERE id = ?', [$id]) === 0) {
            throw new HttpError(404, 'unknown_user');
        }
    }

    /** @param list<mixed> $params */
    private function count(string $sql, array $params = []): int
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($params);
        return (int) $statement->fetchColumn();
    }
}
