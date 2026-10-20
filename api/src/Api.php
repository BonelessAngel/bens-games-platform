<?php

declare(strict_types=1);

namespace BensGames;

use Closure;
use PDO;
use Throwable;

/**
 * Einstieg der API. Wird von api/index.php aufgerufen und ist ohne Webserver testbar.
 */
final class Api
{
    /**
     * @param array<string, mixed>|null $config null, wenn die Konfiguration fehlt oder ungültig ist
     * @param (Closure(): PDO)|null $connect
     */
    public function __construct(
        private ?array $config,
        private ?Closure $connect,
        private string $migrationsDir,
    ) {
    }

    /** @param array<string, string> $headers Header-Namen in Kleinbuchstaben */
    public function handle(string $method, string $path, array $headers): Response
    {
        $routes = [
            'health' => ['GET', fn (): Response => $this->health()],
            'admin/migrate' => ['POST', fn (): Response => $this->migrate($headers)],
        ];

        $route = $routes[trim($path, '/')] ?? null;
        if ($route === null) {
            return new Response(404, ['error' => 'not_found']);
        }
        if ($method !== $route[0]) {
            return new Response(405, ['error' => 'method_not_allowed']);
        }

        try {
            return $route[1]();
        } catch (Throwable $e) {
            error_log('Bens Games API: ' . $e->getMessage());
            return new Response(500, ['error' => 'internal']);
        }
    }

    private function health(): Response
    {
        if ($this->config === null || $this->connect === null) {
            return new Response(503, ['status' => 'error', 'error' => 'config']);
        }
        try {
            $migrator = new Migrator(($this->connect)(), $this->migrationsDir);
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

    /** @param array<string, string> $headers */
    private function migrate(array $headers): Response
    {
        if ($this->config === null || $this->connect === null) {
            return new Response(503, ['error' => 'config']);
        }
        $token = $headers['x-migration-token'] ?? '';
        if (!hash_equals((string) $this->config['migration_token'], $token)) {
            return new Response(403, ['error' => 'forbidden']);
        }

        $migrator = new Migrator(($this->connect)(), $this->migrationsDir);
        return new Response(200, ['applied' => $migrator->migrate(), 'schema' => $migrator->currentVersion()]);
    }
}
