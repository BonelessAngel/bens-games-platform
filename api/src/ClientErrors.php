<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Fehlermeldungen aus den Spielen (Schnittstelle: docs/spiele-anbindung.md, Abschnitt „Fehlermeldungen“).
 *
 * Gespeichert werden nur Meldung, Datei und Zeile, ein gekürzter Aufrufpfad, die Spielversion und die Browser-Familie –
 * kein Konto, keine IP-Adresse, keine vollständigen Adressen (Abfrageteile und fremde Domains werden entfernt,
 * E-Mail-Adressen und lange Zahlen unkenntlich gemacht). Gleiche Fehler werden über einen Fingerabdruck gruppiert.
 */
final class ClientErrors
{
    public const KEEP_DAYS = 90;
    private const PER_IP_HOUR = 60;
    private const PER_APP_HOUR = 2000;

    public function __construct(private PDO $pdo, private Clock $clock, private RateLimiter $limiter, private AuditLog $audit)
    {
    }

    /** @param array<string, mixed> $input {app, message, source?, line?, col?, stack?} */
    public function record(array $input, Request $request): Response
    {
        $app = (string) ($input['app'] ?? '');
        $statement = $this->pdo->prepare("SELECT version FROM apps WHERE id = ? AND type = 'game'");
        $statement->execute([$app]);
        $version = $statement->fetchColumn();
        if ($version === false) {
            throw new HttpError(404, 'unknown_game');
        }
        $message = self::clean((string) ($input['message'] ?? ''), 300, false);
        if ($message === '') {
            throw new HttpError(422, 'validation');
        }
        if (!$this->limiter->hit('errors:ip', Security::ipPrefix($request->ip) ?? 'unbekannt', self::PER_IP_HOUR, 3600)
            || !$this->limiter->hit('errors:app', $app, self::PER_APP_HOUR, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }

        $line = is_int($input['line'] ?? null) && $input['line'] >= 0 ? min($input['line'], 10_000_000) : null;
        $col = is_int($input['col'] ?? null) && $input['col'] >= 0 ? min($input['col'], 10_000_000) : null;
        $source = self::clean((string) ($input['source'] ?? ''), 160, false);
        if ($source !== '' && $line !== null) {
            $source .= ':' . $line . ($col !== null ? ':' . $col : '');
        }
        $stack = self::clean(implode("\n", array_slice(explode("\n", (string) ($input['stack'] ?? '')), 0, 15)), 2000, true);
        // Gleicher Fehler = gleiche Meldung (Zahlen vereinheitlicht) an derselben Stelle.
        $fingerprint = sha1($app . "\0" . preg_replace('/\d+/', '#', $message) . "\0" . $source);

        $this->pdo->prepare(
            'INSERT INTO client_errors (created_at, app_id, version, fingerprint, message, source, stack, browser) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $this->clock->datetime(), $app, $version === null ? null : (string) $version, $fingerprint, $message,
            $source === '' ? null : $source, $stack === '' ? null : $stack, self::browser($request->header('user-agent')),
        ]);
        return new Response(202, ['stored' => 1]);
    }

    /**
     * Gruppierte Fehler für die Zentrale.
     * @param array<string, string> $query {app?, days?}
     */
    public function groups(array $query): Response
    {
        $days = max(1, min(self::KEEP_DAYS, (int) ($query['days'] ?? 30)));
        $apps = $this->pdo->query("SELECT id, name FROM apps WHERE type = 'game' ORDER BY sort_order, name")->fetchAll();
        $app = (string) ($query['app'] ?? '');
        $where = 'e.created_at >= ?';
        $params = [$this->clock->datetime(-$days * 86400)];
        if (in_array($app, array_column($apps, 'id'), true)) {
            $where .= ' AND e.app_id = ?';
            $params[] = $app;
        } else {
            $app = '';
        }
        $statement = $this->pdo->prepare(
            "SELECT e.app_id, e.fingerprint, COUNT(*) AS count, MIN(e.created_at) AS first_seen, MAX(e.created_at) AS last_seen,
                    MAX(e.id) AS last_id, GROUP_CONCAT(DISTINCT e.version ORDER BY e.version SEPARATOR ', ') AS versions,
                    GROUP_CONCAT(DISTINCT e.browser ORDER BY e.browser SEPARATOR ', ') AS browsers, r.resolved_at
             FROM client_errors e
             LEFT JOIN client_errors_resolved r ON r.app_id = e.app_id AND r.fingerprint = e.fingerprint
             WHERE $where GROUP BY e.app_id, e.fingerprint, r.resolved_at ORDER BY last_seen DESC LIMIT 100"
        );
        $statement->execute($params);
        $rows = $statement->fetchAll();
        $sample = $this->pdo->prepare('SELECT message, source, stack, version FROM client_errors WHERE id = ?');
        $groups = array_map(function (array $row) use ($sample): array {
            $sample->execute([$row['last_id']]);
            $last = $sample->fetch() ?: [];
            return [
                'app_id' => $row['app_id'],
                'fingerprint' => $row['fingerprint'],
                'message' => $last['message'] ?? '',
                'source' => $last['source'] ?? null,
                'stack' => $last['stack'] ?? null,
                'count' => (int) $row['count'],
                'first_seen' => $row['first_seen'],
                'last_seen' => $row['last_seen'],
                'versions' => $row['versions'] ?? '',
                'browsers' => $row['browsers'] ?? '',
                // „Erledigt“ gilt, solange der Fehler danach nicht wieder aufgetreten ist.
                'resolved' => $row['resolved_at'] !== null && $row['resolved_at'] >= $row['last_seen'],
            ];
        }, $rows);
        return new Response(200, ['apps' => $apps, 'app' => $app, 'days' => $days, 'groups' => $groups]);
    }

    /**
     * Fehlergruppe als erledigt markieren oder wieder öffnen.
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input {app_id, fingerprint, resolved: bool}
     */
    public function resolve(array $session, array $input, Request $request): Response
    {
        $app = (string) ($input['app_id'] ?? '');
        $fingerprint = (string) ($input['fingerprint'] ?? '');
        if (!preg_match('/^[0-9a-f]{40}$/', $fingerprint)) {
            throw new HttpError(422, 'validation');
        }
        $resolved = ($input['resolved'] ?? null) === true;
        if ($resolved) {
            $this->pdo->prepare(
                'INSERT INTO client_errors_resolved (app_id, fingerprint, resolved_at, resolved_by) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE resolved_at = VALUES(resolved_at), resolved_by = VALUES(resolved_by)'
            )->execute([$app, $fingerprint, $this->clock->datetime(), (int) $session['id']]);
        } else {
            $this->pdo->prepare('DELETE FROM client_errors_resolved WHERE app_id = ? AND fingerprint = ?')->execute([$app, $fingerprint]);
        }
        $this->audit->log($resolved ? 'admin.error_resolved' : 'admin.error_reopened', $request, actorUserId: (int) $session['id'], targetType: 'app', targetId: $app, details: ['fingerprint' => substr($fingerprint, 0, 12)]);
        return new Response(200, ['resolved' => $resolved]);
    }

    /** Entfernt alles, was auf eine Person oder fremde Seiten schließen lassen könnte. */
    public static function clean(string $text, int $max, bool $multiline): string
    {
        // Adressen: nur den Pfad behalten (ohne Domain, Abfrageteil und Anker).
        $text = (string) preg_replace_callback('~\b(?:https?|blob|chrome-extension|moz-extension)://[^\s"\'()<>]+~i', static function (array $m): string {
            $path = parse_url($m[0], PHP_URL_PATH);
            return is_string($path) && $path !== '' ? $path : '/';
        }, $text);
        $text = (string) preg_replace('/[^\s@<>"\']+@[^\s@<>"\']+\.[a-z]{2,}/i', '[E-Mail]', $text);
        $text = (string) preg_replace('/\d{7,}/', '#', $text);
        $text = $multiline
            ? (string) preg_replace('/ *\n */', "\n", (string) preg_replace('/[^\S\n]+/', ' ', str_replace("\r", '', $text)))
            : (string) preg_replace('/\s+/', ' ', $text);
        $text = (string) preg_replace('/[\x00-\x08\x0B-\x1F\x7F]/', '', $text);
        return trim(mb_substr(trim($text), 0, $max));
    }

    /** Nur die Familie, z. B. „Chrome · Android“ – genug, um Fehler einzugrenzen. */
    public static function browser(string $agent): ?string
    {
        if ($agent === '') {
            return null;
        }
        $name = match (true) {
            str_contains($agent, 'Edg/') => 'Edge',
            str_contains($agent, 'SamsungBrowser') => 'Samsung',
            str_contains($agent, 'Firefox/') => 'Firefox',
            str_contains($agent, 'OPR/') => 'Opera',
            str_contains($agent, 'Chrome/') || str_contains($agent, 'CriOS/') => 'Chrome',
            str_contains($agent, 'Safari/') => 'Safari',
            default => 'anderer',
        };
        $system = match (true) {
            str_contains($agent, 'Android') => 'Android',
            str_contains($agent, 'iPhone') || str_contains($agent, 'iPad') => 'iOS',
            str_contains($agent, 'Windows') => 'Windows',
            str_contains($agent, 'Mac OS') => 'macOS',
            str_contains($agent, 'Linux') => 'Linux',
            default => 'anderes',
        };
        return "$name · $system";
    }
}
