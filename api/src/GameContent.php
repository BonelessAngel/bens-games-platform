<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Vom Spiel-Team veröffentlichte Inhalte, z. B. die Kampagne von Nova Bastion (ersetzt das Netlify-„camp“ mit Entwickler-PIN).
 * Hochladen nur in der Zentrale mit dem Recht app.<id>.manage – nie aus dem Spiel heraus. Lesen ist öffentlich.
 */
final class GameContent
{
    public const MAX_BYTES = 2_000_000;

    /** Erlaubte Inhalte je Spiel und ihre Mindestprüfung. */
    private const KEYS = ['nova-bastion' => ['campaign']];

    public function __construct(private PDO $pdo, private Clock $clock, private AuditLog $audit)
    {
    }

    /** Öffentlich: {ts, json} – ts = 0 und json = null, solange nichts veröffentlicht ist. */
    public function get(string $appId, string $key): Response
    {
        $this->assertKey($appId, $key);
        $statement = $this->pdo->prepare('SELECT json, ts FROM app_content WHERE app_id = ? AND content_key = ?');
        $statement->execute([$appId, $key]);
        $row = $statement->fetch();
        return new Response(200, $row ? ['ts' => (int) $row['ts'], 'json' => $row['json']] : ['ts' => 0, 'json' => null]);
    }

    /** Für die Zentrale: Stand ohne Inhalt. */
    public function info(string $appId, string $key): Response
    {
        $this->assertKey($appId, $key);
        $statement = $this->pdo->prepare(
            'SELECT c.ts, LENGTH(c.json) AS size, c.updated_at, u.display_name AS updated_by FROM app_content c
             LEFT JOIN users u ON u.id = c.updated_by WHERE c.app_id = ? AND c.content_key = ?'
        );
        $statement->execute([$appId, $key]);
        $row = $statement->fetch();
        return new Response(200, ['content' => $row ?: null]);
    }

    /**
     * Veröffentlichen. Der Inhalt muss gültiges JSON sein; eine Kampagne braucht mindestens eine Welt.
     * @param array<string, mixed> $session
     */
    public function put(array $session, string $appId, string $key, mixed $json, Request $request): Response
    {
        $this->assertKey($appId, $key);
        if (!is_string($json) || $json === '' || strlen($json) > self::MAX_BYTES) {
            throw new HttpError(422, 'validation', ['fields' => ['json' => 'Datei fehlt oder ist größer als 2 MB.']]);
        }
        $data = json_decode($json, true);
        if ($key === 'campaign' && (!is_array($data) || !is_array($data['worlds'] ?? null) || $data['worlds'] === [])) {
            throw new HttpError(422, 'validation', ['fields' => ['json' => 'Das ist keine Kampagne (es fehlen die Welten).']]);
        }
        // Zeitstempel wie im Spiel (Millisekunden); neuer als alles Bisherige, damit Spieler sie sicher laden.
        $ts = max((int) ($data['ts'] ?? 0), $this->clock->now() * 1000);
        $this->pdo->prepare(
            'INSERT INTO app_content (app_id, content_key, json, ts, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE json = VALUES(json), ts = VALUES(ts), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)'
        )->execute([$appId, $key, $json, $ts, $session['id'], $this->clock->datetime()]);
        $this->audit->log('admin.content_published', $request, actorUserId: (int) $session['id'], targetType: 'app', targetId: $appId, details: ['key' => $key, 'bytes' => strlen($json)]);
        return new Response(200, ['ok' => true, 'ts' => $ts]);
    }

    private function assertKey(string $appId, string $key): void
    {
        if (!in_array($key, self::KEYS[$appId] ?? [], true)) {
            throw new HttpError(404, 'not_found');
        }
    }
}
