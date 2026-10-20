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
    ) {
    }

    public function handle(Request $request): Response
    {
        // [Methode, braucht Anmeldung, Handler]
        $routes = [
            'health' => ['GET', false, fn (): Response => $this->health()],
            'admin/migrate' => ['POST', false, fn (): Response => $this->migrate($request)],
            'auth/register' => ['POST', false, fn (): Response => $this->accounts()->register($request->json(), $request)],
            'auth/verify' => ['POST', false, fn (): Response => $this->accounts()->verify($request->json(), $request)],
            'auth/resend-verification' => ['POST', false, fn (): Response => $this->accounts()->resendVerification($request->json(), $request)],
            'auth/login' => ['POST', false, fn (): Response => $this->accounts()->login($request->json(), $request)],
            'auth/logout' => ['POST', true, fn (array $session): Response => $this->accounts()->logout($session, $request)],
            'account/me' => ['GET', true, fn (array $session): Response => $this->accounts()->me($session)],
        ];

        $route = $routes[$request->path] ?? null;
        if ($route === null) {
            return new Response(404, ['error' => 'not_found']);
        }
        [$method, $needsSession, $handler] = $route;
        if ($request->method !== $method) {
            return new Response(405, ['error' => 'method_not_allowed']);
        }

        try {
            if ($request->path !== 'health' && $request->path !== 'admin/migrate' && $this->config === null) {
                throw new HttpError(503, 'unavailable');
            }
            if ($method === 'POST' && $request->path !== 'admin/migrate') {
                $this->assertSameOrigin($request);
            }
            if (!$needsSession) {
                return $handler();
            }

            $session = (new Sessions($this->pdo(), $this->clock))->current($request);
            if ($session === null) {
                throw new HttpError(401, 'not_logged_in');
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

    private function accounts(): Accounts
    {
        $pdo = $this->pdo();
        $mailer = $this->mailer ?? new PhpMailer(
            (string) ($this->config['mail']['from'] ?? 'noreply@bens-games.de'),
            (string) ($this->config['mail']['from_name'] ?? 'Bens Games'),
        );
        return new Accounts(
            $pdo,
            $this->clock,
            $mailer,
            new RateLimiter($pdo, $this->clock),
            new Sessions($pdo, $this->clock),
            new AuditLog($pdo, $this->clock),
            Config::baseUrl($this->config ?? []),
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
        return new Response(200, ['applied' => $migrator->migrate(), 'schema' => $migrator->currentVersion()]);
    }
}
