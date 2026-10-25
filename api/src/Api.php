<?php

declare(strict_types=1);

namespace BensGames;

use Closure;
use PDO;
use Throwable;

/**
 * Einstieg der API. Wird von api/index.php aufgerufen und ist ohne Webserver testbar.
 *
 * Schutz für alle Anfragen, die etwas verändern (POST):
 * - Origin muss die eigene Adresse sein (verhindert Anfragen von fremden Seiten),
 * - Inhalt muss JSON sein,
 * - angemeldete Aktionen brauchen zusätzlich das CSRF-Token der Sitzung (Header X-CSRF-Token).
 */
final class Api
{
    private ?PDO $pdo = null;

    /**
     * @param array<string, mixed>|null $config null, wenn die Konfiguration fehlt oder ungültig ist
     * @param (Closure(): PDO)|null $connect
     */
    public function __construct(
        private ?array $config,
        private ?Closure $connect,
        private string $migrationsDir,
        private ?Mailer $mailer = null,
        private Clock $clock = new Clock(),
        private ?string $appsFile = null,
    ) {
    }

    public function handle(Request $request): Response
    {
        // Pfade mit Spiel-ID, z. B. games/nova-bastion/save → games/{id}/save
        $path = $request->path;
        $gameId = '';
        if (preg_match('#^games/([a-z0-9]+(?:-[a-z0-9]+)*)/(save(?:/put|/delete)?|scores|leaderboard|hub|campaign|levels(?:/get|/upload|/like|/result|/delete)?)$#', $path, $match)) {
            $gameId = $match[1];
            $path = 'games/{id}/' . $match[2];
        }

        // [Methode, braucht Anmeldung, Handler] – Routen der Webseite (bens-games.de)
        $siteRoutes = [
            'games/{id}/save' => ['GET', true, fn (array $session): Response => $this->gameSaves()->get($session, $gameId)],
            'games/{id}/save/put' => ['POST', true, fn (array $session): Response => $this->gameSaves()->put($session, $gameId, $request->json())],
            'games/{id}/save/delete' => ['POST', true, fn (array $session): Response => $this->gameSaves()->delete($session, $gameId, $request)],
            'account/games' => ['GET', true, fn (array $session): Response => $this->gameSaves()->overview($session)],
            // Spielstatistik: Gäste anonym, Angemeldete mit Konto (außer bei Widerspruch). Kein CSRF-Token nötig,
            // die Herkunftsprüfung verhindert Ereignisse von fremden Seiten.
            'events' => ['POST', false, fn (): Response => $this->gameStats()->record($request->json(), $this->sessions()->current($request), $request)],
            // Fehlermeldungen aus den Spielen: ohne Konto, ohne IP-Adresse (docs/spiele-anbindung.md).
            'errors' => ['POST', false, fn (): Response => $this->clientErrors()->record($request->json(), $request)],
            'account/stats' => ['GET', true, fn (array $session): Response => new Response(200, [
                'opt_out' => (bool) $session['stats_opt_out'],
                'leaderboard_opt_out' => (bool) $session['leaderboard_opt_out'],
                'games' => $this->gameStats()->forUser((int) $session['id']),
            ])],
            'account/stats/settings' => ['POST', true, fn (array $session): Response => $this->statsSettings($session, $request)],
            'account/leaderboard/settings' => ['POST', true, fn (array $session): Response => $this->leaderboardSettings($session, $request)],
            // Ranglisten: lesen öffentlich (mit Anmeldung zusätzlich der eigene Platz), melden nur angemeldet mit CSRF-Token.
            'games/{id}/leaderboard' => ['GET', false, fn (): Response => $this->leaderboards()->show($gameId, $request->query, $this->sessions()->current($request))],
            'games/{id}/scores' => ['POST', true, fn (array $session): Response => $this->leaderboards()->submit($session, $gameId, $request->json())],
            // Community (Phase 6): Ankündigungen, Weiterspielen, öffentliche Spielerprofile.
            'announcements' => ['GET', false, fn (): Response => $this->announcements()->active(
                preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', (string) ($request->query['app'] ?? '')) === 1 ? (string) $request->query['app'] : null,
                $this->sessions()->current($request),
            )],
            // Startbildschirm eines Spiels: Anmeldung, beste Plätze, Ankündigungen, Links (docs/spiele-anbindung.md).
            'games/{id}/hub' => ['GET', false, fn (): Response => $this->community()->hub($gameId, $this->sessions()->current($request), $this->announcements())],
            // Community-Level (docs/community-level-api.md): spielen für alle, hochladen/Daumen/löschen mit Konto.
            'games/{id}/levels' => ['GET', false, fn (): Response => $this->levels()->list($gameId, $this->sessions()->current($request))],
            'games/{id}/levels/get' => ['GET', false, fn (): Response => $this->levels()->get($gameId, $request->query)],
            'games/{id}/levels/upload' => ['POST', true, fn (array $session): Response => $this->levels()->upload($session, $gameId, $request->json(), $request)],
            'games/{id}/levels/like' => ['POST', true, fn (array $session): Response => $this->levels()->like($session, $gameId, $request->json())],
            'games/{id}/levels/delete' => ['POST', true, fn (array $session): Response => $this->levels()->delete($session, $gameId, $request->json(), $request)],
            // Ergebnis auch ohne Konto (wie die Spielstatistik: Herkunftsprüfung statt CSRF-Token).
            'games/{id}/levels/result' => ['POST', false, fn (): Response => $this->levels()->result($this->sessions()->current($request), $gameId, $request->json(), $request)],
            'games/{id}/campaign' => ['GET', false, fn (): Response => $this->content()->get($gameId, 'campaign')],
            'account/recent' => ['GET', true, fn (array $session): Response => $this->community()->recent($session, new AppCatalog($this->pdo(), $this->clock))],
            'players/profile' => ['GET', false, fn (): Response => $this->community()->profile($request->query, $this->sessions()->current($request))],
            'health' => ['GET', false, fn (): Response => $this->health()],
            'apps' => ['GET', false, fn (): Response => $this->apps($request)],
            'admin/migrate' => ['POST', false, fn (): Response => $this->migrate($request)],
            'admin/cleanup' => ['POST', false, fn (): Response => $this->cleanup($request)],
            'auth/register' => ['POST', false, fn (): Response => $this->accounts()->register($request->json(), $request)],
            'auth/verify' => ['POST', false, fn (): Response => $this->accounts()->verify($request->json(), $request)],
            'auth/resend-verification' => ['POST', false, fn (): Response => $this->accounts()->resendVerification($request->json(), $request)],
            'auth/login' => ['POST', false, fn (): Response => $this->accounts()->login($request->json(), $request)],
            'auth/login/two-factor' => ['POST', false, fn (): Response => $this->accounts()->loginTwoFactor($request->json(), $request)],
            'account/2fa/setup' => ['POST', true, fn (array $session): Response => $this->twoFactor()->setup($session, $request->json(), $request)],
            'account/2fa/enable' => ['POST', true, fn (array $session): Response => $this->twoFactor()->enable($session, $request->json(), $request)],
            'account/2fa/disable' => ['POST', true, fn (array $session): Response => $this->twoFactor()->disable($session, $request->json(), $request)],
            'account/2fa/recovery-codes' => ['POST', true, fn (array $session): Response => $this->twoFactor()->regenerateRecoveryCodes($session, $request->json(), $request)],
            'auth/forgot-password' =>['POST', false, fn (): Response => $this->accounts()->forgotPassword($request->json(), $request)],
            'auth/reset-password' => ['POST', false, fn (): Response => $this->accounts()->resetPassword($request->json(), $request)],
            'auth/logout' => ['POST', true, fn (array $session): Response => $this->accounts()->logout($session, $request)],
            'account/me' => ['GET', true, fn (array $session): Response => $this->accountMe($session)],
            // Für die Webseite: immer 200, auch ohne Anmeldung (die Spiele nutzen weiter account/me mit 401).
            'account/status' => ['GET', false, function () use ($request): Response {
                $session = $this->sessions()->current($request);
                return new Response(200, ['user' => $session === null ? null : Accounts::publicUser($session)]);
            }],
            'account/profile' => ['POST', true, fn (array $session): Response => $this->accounts()->updateProfile($session, $request->json(), $request)],
            // Profil gestalten: Banner, Titel, angepinnte Abzeichen, Aktivitäts-Kalender (src/konto, Reiter Profil)
            'account/profile-style' => ['GET', true, fn (array $session): Response => $this->profiles()->options($session)],
            'account/profile-style/save' => ['POST', true, fn (array $session): Response => $this->profiles()->save($session, $request->json())],
            'account/password' => ['POST', true, fn (array $session): Response => $this->accounts()->changePassword($session, $request->json(), $request)],
            'account/sessions' => ['GET', true, fn (array $session): Response => $this->accounts()->listSessions($session)],
            'account/sessions/revoke' => ['POST', true, fn (array $session): Response => $this->accounts()->revokeSession($session, $request->json(), $request)],
            'account/sessions/revoke-others' => ['POST', true, fn (array $session): Response => $this->accounts()->revokeOtherSessions($session, $request)],
            'account/delete' => ['POST', true, fn (array $session): Response => $this->accounts()->deleteAccount($session, $request->json(), $request)],
        ];

        // Routen der Zentrale (admin.bens-games.de) – auf der Webseite gibt es sie nicht, und umgekehrt.
        $adminRoutes = [
            'health' => ['GET', false, fn (): Response => $this->health()],
            'auth/login' => ['POST', false, fn (): Response => $this->accounts()->login($request->json(), $request)],
            'auth/login/two-factor' => ['POST', false, fn (): Response => $this->accounts()->loginTwoFactor($request->json(), $request)],
            'auth/logout' => ['POST', true, fn (array $session): Response => $this->accounts()->logout($session, $request)],
            'admin/me' => ['GET', true, fn (array $session): Response => $this->admin()->me($session)],
            'admin/overview' => ['GET', true, fn (array $session): Response => $this->admin()->overview($session)],
            'admin/users' => ['GET', true, fn (array $session): Response => $this->admin()->users($session, $request->query)],
            'admin/users/lock' => ['POST', true, fn (array $session): Response => $this->admin()->lock($session, $request->json(), $request)],
            'admin/users/revoke-sessions' => ['POST', true, fn (array $session): Response => $this->admin()->revokeSessions($session, $request->json(), $request)],
            'admin/rights' => ['GET', true, fn (array $session): Response => $this->admin()->rights($session, $request->query)],
            'admin/rights/set' => ['POST', true, fn (array $session): Response => $this->admin()->setRights($session, $request->json(), $request)],
            'admin/audit' => ['GET', true, fn (array $session): Response => $this->admin()->audit($session, $request->query)],
            'admin/games' => ['GET', true, fn (array $session): Response => $this->admin()->games($session, $request->query)],
            'admin/users/stats' => ['GET', true, fn (array $session): Response => $this->admin()->userStats($session, $request->query)],
            'admin/leaderboard' => ['GET', true, fn (array $session): Response => $this->admin()->leaderboard($session, $request->query, $this->leaderboards())],
            'admin/leaderboard/hide' => ['POST', true, fn (array $session): Response => $this->admin()->hideScore($session, $request->json(), $request, $this->leaderboards())],
            'admin/apps' => ['GET', true, fn (array $session): Response => $this->admin()->apps($session)],
            'admin/apps/update' => ['POST', true, fn (array $session): Response => $this->admin()->updateApp($session, $request->json(), $request)],
            'admin/apps/access' => ['POST', true, fn (array $session): Response => $this->admin()->setAppAccess($session, $request->json(), $request)],
            'admin/levels' => ['GET', true, function (array $session) use ($request): Response {
                $this->permitted($session, 'moderation');
                return $this->levels()->moderationList($request->query);
            }],
            'admin/levels/hide' => ['POST', true, function (array $session) use ($request): Response {
                $this->permitted($session, 'moderation');
                return $this->levels()->setHidden($session, $request->json(), $request);
            }],
            'admin/levels/delete' => ['POST', true, function (array $session) use ($request): Response {
                $this->permitted($session, 'moderation');
                return $this->levels()->moderatorDelete($session, $request->json(), $request);
            }],
            'admin/content' => ['GET', true, function (array $session) use ($request): Response {
                $appId = (string) ($request->query['app'] ?? '');
                $this->permitted($session, "app.$appId.manage");
                return $this->content()->info($appId, (string) ($request->query['key'] ?? ''));
            }],
            'admin/content/publish' => ['POST', true, fn (array $session): Response => $this->publishContent($session, $request)],
            'admin/announcements' => ['GET', true, fn (array $session): Response => $this->announcementsFor($session)->all()],
            'admin/announcements/save' => ['POST', true, fn (array $session): Response => $this->announcementsFor($session)->save($session, $request->json(), $request)],
            'admin/announcements/delete' => ['POST', true, fn (array $session): Response => $this->announcementsFor($session)->delete($session, $request->json(), $request)],
            'admin/funnel' => ['GET', true, fn (array $session): Response => $this->admin()->funnel($session, $request->query)],
            'admin/errors' => ['GET', true, function (array $session) use ($request): Response {
                $this->permitted($session, 'stats.view');
                return $this->clientErrors()->groups($request->query);
            }],
            'admin/errors/resolve' => ['POST', true, function (array $session) use ($request): Response {
                $this->permitted($session, 'stats.view');
                return $this->clientErrors()->resolve($session, $request->json(), $request);
            }],
            'admin/saves' => ['GET', true, fn (array $session): Response => $this->admin()->saves($session, $request->query, $this->saveHistory())],
            'admin/saves/restore' => ['POST', true, fn (array $session): Response => $this->admin()->restoreSave($session, $request->json(), $request, $this->saveHistory())],
            'admin/system' => ['GET', true, fn (array $session): Response => $this->system($session)],
            // Eigene Anmeldungen (Webseite und Zentrale) ansehen und beenden.
            'admin/sessions' => ['GET', true, fn (array $session): Response => $this->accounts()->listSessions($session)],
            'admin/sessions/revoke' => ['POST', true, fn (array $session): Response => $this->accounts()->revokeSession($session, $request->json(), $request)],
            'admin/sessions/revoke-others' => ['POST', true, fn (array $session): Response => $this->accounts()->revokeOtherSessions($session, $request)],
        ];

        $routes = $this->isAdmin() ? $adminRoutes : $siteRoutes;
        $route = $routes[$path] ?? null;
        if ($route === null) {
            return new Response(404, ['error' => 'not_found']);
        }
        [$method, $needsSession, $handler] = $route;
        if ($request->method !== $method) {
            return new Response(405, ['error' => 'method_not_allowed']);
        }

        try {
            $internal = in_array($request->path, ['health', 'admin/migrate', 'admin/cleanup'], true);
            if (!$internal && $this->config === null) {
                throw new HttpError(503, 'unavailable');
            }
            // Interne Aufrufe von GitHub Actions haben eigene Schlüssel statt Origin und CSRF.
            if ($method === 'POST' && !$internal) {
                $this->assertSameOrigin($request);
            }
            if (!$needsSession) {
                return $handler();
            }

            $session = $this->sessions()->current($request);
            if ($session === null) {
                throw new HttpError(401, 'not_logged_in');
            }
            // Zentrale: Rechte bei jeder Anfrage neu prüfen (sie können inzwischen entzogen worden sein).
            if ($this->isAdmin() && !(new Permissions($this->pdo()))->canEnterPanel((int) $session['id'])) {
                throw new HttpError(403, 'no_panel_access');
            }
            if ($method === 'POST' && !hash_equals((string) $session['csrf_token'], $request->header('x-csrf-token'))) {
                throw new HttpError(403, 'csrf');
            }
            return $handler($session);
        } catch (HttpError $e) {
            return new Response($e->status, ['error' => $e->error] + $e->extra);
        } catch (Throwable $e) {
            error_log('Bens Games API: ' . $e->getMessage());
            return new Response(500, ['error' => 'internal']);
        }
    }

    private function assertSameOrigin(Request $request): void
    {
        $expected = Config::baseUrl($this->config ?? []);
        if ($request->header('origin') !== $expected) {
            throw new HttpError(403, 'origin');
        }
        if (!str_starts_with(strtolower($request->header('content-type')), 'application/json')) {
            throw new HttpError(415, 'json_required');
        }
    }

    private function isAdmin(): bool
    {
        return Config::role($this->config ?? []) === 'admin';
    }

    /** Sitzungen dieses Bereichs: Webseite und Zentrale haben getrennte Anmeldungen. */
    private function sessions(): Sessions
    {
        return new Sessions($this->pdo(), $this->clock, $this->isAdmin() ? 'admin' : 'site');
    }

    private function accounts(): Accounts
    {
        $pdo = $this->pdo();
        return new Accounts(
            $pdo,
            $this->clock,
            $this->mailer(),
            new RateLimiter($pdo, $this->clock),
            $this->sessions(),
            new AuditLog($pdo, $this->clock),
            Config::siteUrl($this->config ?? []),
            $this->twoFactor(),
            new Reauth(new RateLimiter($pdo, $this->clock)),
            $this->isAdmin() ? new Permissions($pdo) : null,
        );
    }

    private function admin(): Admin
    {
        $pdo = $this->pdo();
        return new Admin($pdo, $this->clock, new Permissions($pdo), $this->sessions(), new AuditLog($pdo, $this->clock), $this->gameStats());
    }

    private function announcements(): Announcements
    {
        $pdo = $this->pdo();
        return new Announcements($pdo, $this->clock, new AuditLog($pdo, $this->clock));
    }

    /** Ankündigungen verwalten nur mit dem Recht announcements.manage (Besitzer haben es immer). @param array<string, mixed> $session */
    private function announcementsFor(array $session): Announcements
    {
        if (!(new Permissions($this->pdo()))->has((int) $session['id'], 'announcements.manage')) {
            throw new HttpError(403, 'missing_permission', ['permission' => 'announcements.manage']);
        }
        return $this->announcements();
    }

    /** „Mein Konto“: zusätzlich, ob das Konto die Zentrale betreten darf (für den Knopf „Zur Zentrale“). @param array<string, mixed> $session */
    private function accountMe(array $session): Response
    {
        $response = $this->accounts()->me($session);
        $body = $response->body;
        $body['user']['panel'] = (new Permissions($this->pdo()))->canEnterPanel((int) $session['id']);
        return new Response($response->status, $body);
    }

    private function community(): Community
    {
        return new Community($this->pdo(), $this->leaderboards(), new Permissions($this->pdo()), $this->profiles());
    }

    private function profiles(): Profiles
    {
        return new Profiles($this->pdo(), $this->clock, $this->leaderboards());
    }

    /** Prüft ein Recht in der Zentrale (bricht sonst mit 403 ab). @param array<string, mixed> $session */
    private function permitted(array $session, string $permission): void
    {
        if (!(new Permissions($this->pdo()))->has((int) $session['id'], $permission)) {
            throw new HttpError(403, 'missing_permission', ['permission' => $permission]);
        }
    }

    private function levels(): CommunityLevels
    {
        $pdo = $this->pdo();
        return new CommunityLevels($pdo, $this->clock, new RateLimiter($pdo, $this->clock), new AuditLog($pdo, $this->clock));
    }

    private function content(): GameContent
    {
        $pdo = $this->pdo();
        return new GameContent($pdo, $this->clock, new AuditLog($pdo, $this->clock));
    }

    /** Kampagne veröffentlichen: nur in der Zentrale mit app.<id>.manage. @param array<string, mixed> $session */
    private function publishContent(array $session, Request $request): Response
    {
        $input = $request->json();
        $appId = (string) ($input['app_id'] ?? '');
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $appId)) {
            throw new HttpError(404, 'unknown_app');
        }
        $this->permitted($session, "app.$appId.manage");
        return $this->content()->put($session, $appId, (string) ($input['key'] ?? ''), $input['json'] ?? null, $request);
    }

    private function gameStats(): GameStats
    {
        $pdo = $this->pdo();
        return new GameStats($pdo, $this->clock, new RateLimiter($pdo, $this->clock));
    }

    private function leaderboards(): Leaderboards
    {
        $pdo = $this->pdo();
        return new Leaderboards($pdo, $this->clock, new RateLimiter($pdo, $this->clock), new AuditLog($pdo, $this->clock));
    }

    /** In Ranglisten erscheinen oder nicht. @param array<string, mixed> $session */
    private function leaderboardSettings(array $session, Request $request): Response
    {
        $optOut = ($request->json()['opt_out'] ?? null) === true;
        $this->pdo()->prepare('UPDATE users SET leaderboard_opt_out = ? WHERE id = ?')->execute([$optOut ? 1 : 0, $session['id']]);
        (new AuditLog($this->pdo(), $this->clock))->log($optOut ? 'user.leaderboard_opt_out' : 'user.leaderboard_opt_in', $request, actorUserId: (int) $session['id'], targetType: 'user', targetId: (string) $session['id']);
        return new Response(200, ['opt_out' => $optOut]);
    }

    /** Widerspruch gegen die Zuordnung der Spielstatistik zum Konto (Art. 21 DSGVO). @param array<string, mixed> $session */
    private function statsSettings(array $session, Request $request): Response
    {
        $optOut = ($request->json()['opt_out'] ?? null) === true;
        $this->pdo()->prepare('UPDATE users SET stats_opt_out = ? WHERE id = ?')->execute([$optOut ? 1 : 0, $session['id']]);
        if ($optOut) {
            // Auch die bisherige Statistik vom Konto trennen – sie zählt nur noch anonym mit.
            $this->pdo()->prepare('UPDATE game_events SET user_id = NULL WHERE user_id = ?')->execute([$session['id']]);
        }
        (new AuditLog($this->pdo(), $this->clock))->log($optOut ? 'user.stats_opt_out' : 'user.stats_opt_in', $request, actorUserId: (int) $session['id'], targetType: 'user', targetId: (string) $session['id']);
        return new Response(200, ['opt_out' => $optOut]);
    }

    private function gameSaves(): GameSaves
    {
        $pdo = $this->pdo();
        return new GameSaves($pdo, $this->clock, new RateLimiter($pdo, $this->clock), new AuditLog($pdo, $this->clock), $this->saveHistory());
    }

    private function saveHistory(): SaveHistory
    {
        return new SaveHistory($this->pdo(), $this->clock);
    }

    private function clientErrors(): ClientErrors
    {
        $pdo = $this->pdo();
        return new ClientErrors($pdo, $this->clock, new RateLimiter($pdo, $this->clock), new AuditLog($pdo, $this->clock));
    }

    /**
     * Technik-Übersicht für die Zentrale: Umgebung, Versionen, Datenbank, Migrationen und Datenmengen.
     * @param array<string, mixed> $session
     */
    private function system(array $session): Response
    {
        $this->permitted($session, 'stats.view');
        $pdo = $this->pdo();
        $migrator = new Migrator($pdo, $this->migrationsDir);
        $tables = $pdo->query(
            'SELECT table_name AS name, table_rows AS row_estimate, data_length + index_length AS bytes
             FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY bytes DESC'
        )->fetchAll();
        $day = $this->clock->datetime(-86400);
        $count = static function (string $sql, array $params = []) use ($pdo): int {
            $statement = $pdo->prepare($sql);
            $statement->execute($params);
            return (int) $statement->fetchColumn();
        };
        return new Response(200, [
            'environment' => $this->config['environment'] ?? '',
            'php' => PHP_VERSION,
            'database' => (string) $pdo->query('SELECT VERSION()')->fetchColumn(),
            'schema' => $migrator->currentVersion(),
            'pending_migrations' => $migrator->pending(),
            'server_time' => $this->clock->datetime(),
            'apps' => $pdo->query('SELECT id, name, type, version, status, visibility FROM apps ORDER BY sort_order, name')->fetchAll(),
            'tables' => array_map(static fn (array $t): array => ['name' => $t['name'], 'rows' => (int) $t['row_estimate'], 'bytes' => (int) $t['bytes']], $tables),
            'last_24h' => [
                'events' => $count('SELECT COUNT(*) FROM game_events WHERE created_at >= ?', [$day]),
                'errors' => $count('SELECT COUNT(*) FROM client_errors WHERE created_at >= ?', [$day]),
                'saves' => $count('SELECT COUNT(*) FROM game_saves WHERE updated_at >= ?', [$day]),
                'logins' => $count("SELECT COUNT(*) FROM audit_log WHERE action = 'user.login' AND created_at >= ?", [$day]),
            ],
        ]);
    }

    private function twoFactor(): TwoFactor
    {
        $pdo = $this->pdo();
        $appSecret = (string) ($this->config['app_secret'] ?? '');
        return new TwoFactor(
            $pdo,
            $this->clock,
            new SecretBox($appSecret, 'totp'),
            $appSecret,
            $this->mailer(),
            new AuditLog($pdo, $this->clock),
            new Sessions($pdo, $this->clock),
            new Reauth(new RateLimiter($pdo, $this->clock)),
        );
    }

    private function mailer(): Mailer
    {
        return $this->mailer ??= new PhpMailer(
            (string) ($this->config['mail']['from'] ?? 'noreply@bens-games.de'),
            (string) ($this->config['mail']['from_name'] ?? 'Bens Games'),
        );
    }

    private function pdo(): PDO
    {
        if ($this->connect === null) {
            throw new HttpError(503, 'unavailable');
        }
        return $this->pdo ??= ($this->connect)();
    }

    private function health(): Response
    {
        if ($this->config === null || $this->connect === null) {
            return new Response(503, ['status' => 'error', 'error' => 'config']);
        }
        try {
            $migrator = new Migrator($this->pdo(), $this->migrationsDir);
            return new Response(200, [
                'status' => 'ok',
                'environment' => $this->config['environment'],
                'database' => 'ok',
                'schema' => $migrator->currentVersion(),
                'pending_migrations' => count($migrator->pending()),
            ]);
        } catch (Throwable $e) {
            error_log('Bens Games API (health): ' . $e->getMessage());
            return new Response(503, ['status' => 'error', 'error' => 'database']);
        }
    }

    private function migrate(Request $request): Response
    {
        if ($this->config === null || $this->connect === null) {
            return new Response(503, ['error' => 'config']);
        }
        if (!hash_equals((string) $this->config['migration_token'], $request->header('x-migration-token'))) {
            return new Response(403, ['error' => 'forbidden']);
        }

        $migrator = new Migrator($this->pdo(), $this->migrationsDir);
        $applied = $migrator->migrate();

        // App-Verzeichnis aus apps.json abgleichen (wird beim Build nach api/data/ kopiert).
        $synced = 0;
        if ($this->appsFile !== null && is_file($this->appsFile)) {
            $apps = json_decode((string) file_get_contents($this->appsFile), true, flags: JSON_THROW_ON_ERROR);
            $synced = (new AppCatalog($this->pdo(), $this->clock))->sync($apps);
        }

        return new Response(200, ['applied' => $applied, 'schema' => $migrator->currentVersion(), 'apps_synced' => $synced]);
    }

    /**
     * Tägliches Aufräumen. Akzeptiert maintenance_token (nur fürs Aufräumen, darf ohne Freigabe laufen)
     * oder migration_token.
     */
    private function cleanup(Request $request): Response
    {
        if ($this->config === null || $this->connect === null) {
            return new Response(503, ['error' => 'config']);
        }
        $given = $request->header('x-maintenance-token');
        $allowed = array_filter([
            (string) ($this->config['maintenance_token'] ?? ''),
            (string) $this->config['migration_token'],
        ], static fn (string $token): bool => strlen($token) >= 32);
        $valid = false;
        foreach ($allowed as $token) {
            $valid = hash_equals($token, $given) || $valid;
        }
        if (!$valid) {
            return new Response(403, ['error' => 'forbidden']);
        }
        return new Response(200, ['deleted' => (new Cleanup($this->pdo(), $this->clock))->run()]);
    }

    /** Für Gäste die öffentlichen Apps, für Angemeldete zusätzlich ihre freigegebenen. */
    private function apps(Request $request): Response
    {
        $session = (new Sessions($this->pdo(), $this->clock))->current($request);
        $apps = (new AppCatalog($this->pdo(), $this->clock))->visibleFor($session === null ? null : (int) $session['id']);
        return new Response(200, ['apps' => $apps]);
    }
}
