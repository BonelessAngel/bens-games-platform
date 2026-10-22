<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Ankündigungen (Phase 6). Verwaltet in der Zentrale (Recht announcements.manage), angezeigt auf der Webseite
 * und – über GET /api/announcements?app=<id> – in den Spielen. Nur Text, optional ein Link auf diese Webseite oder https.
 */
final class Announcements
{
    public const LEVELS = ['info', 'success', 'warning'];
    public const AUDIENCES = ['all', 'signed_in', 'app'];

    public function __construct(private PDO $pdo, private Clock $clock, private AuditLog $audit)
    {
    }

    /**
     * Aktuell sichtbare Ankündigungen für diesen Besucher.
     * @param array<string, mixed>|null $session
     */
    public function active(?string $appId, ?array $session): Response
    {
        $now = $this->clock->datetime();
        $statement = $this->pdo->prepare(
            "SELECT id, title, body, link, level, audience, app_id, starts_at FROM announcements
             WHERE starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)
               AND (audience = 'all' OR (audience = 'signed_in' AND ? = 1) OR (audience = 'app' AND app_id = ?))
             ORDER BY starts_at DESC, id DESC LIMIT 5"
        );
        $statement->execute([$now, $now, $session === null ? 0 : 1, $appId ?? '']);
        return new Response(200, ['announcements' => array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'body' => $row['body'],
            'link' => $row['link'],
            'level' => $row['level'],
            'app_id' => $row['app_id'],
        ], $statement->fetchAll())]);
    }

    /** Alle Ankündigungen für die Zentrale, neueste zuerst. */
    public function all(): Response
    {
        $rows = $this->pdo->query(
            'SELECT a.*, u.display_name AS author FROM announcements a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.starts_at DESC, a.id DESC LIMIT 100'
        )->fetchAll();
        $now = $this->clock->datetime();
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['state'] = $row['starts_at'] > $now ? 'planned' : (($row['ends_at'] !== null && $row['ends_at'] <= $now) ? 'ended' : 'active');
        }
        unset($row);
        $apps = $this->pdo->query("SELECT id, name FROM apps ORDER BY sort_order, name")->fetchAll();
        return new Response(200, ['announcements' => $rows, 'apps' => $apps]);
    }

    /**
     * Anlegen oder ändern.
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input
     */
    public function save(array $session, array $input, Request $request): Response
    {
        $data = $this->validate($input);
        $id = (int) ($input['id'] ?? 0);
        $now = $this->clock->datetime();
        if ($id > 0) {
            $statement = $this->pdo->prepare(
                'UPDATE announcements SET title = ?, body = ?, link = ?, level = ?, audience = ?, app_id = ?, starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?'
            );
            $statement->execute([...array_values($data), $now, $id]);
            if ($statement->rowCount() === 0 && !$this->exists($id)) {
                throw new HttpError(404, 'not_found');
            }
        } else {
            $this->pdo->prepare(
                'INSERT INTO announcements (title, body, link, level, audience, app_id, starts_at, ends_at, created_by, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([...array_values($data), $session['id'], $now, $now]);
            $id = (int) $this->pdo->lastInsertId();
        }
        $this->audit->log('admin.announcement_saved', $request, actorUserId: (int) $session['id'], targetType: 'announcement', targetId: (string) $id, details: ['title' => $data['title']]);
        return new Response(200, ['id' => $id]);
    }

    /** @param array<string, mixed> $session @param array<string, mixed> $input */
    public function delete(array $session, array $input, Request $request): Response
    {
        $id = (int) ($input['id'] ?? 0);
        $statement = $this->pdo->prepare('DELETE FROM announcements WHERE id = ?');
        $statement->execute([$id]);
        if ($statement->rowCount() === 0) {
            throw new HttpError(404, 'not_found');
        }
        $this->audit->log('admin.announcement_deleted', $request, actorUserId: (int) $session['id'], targetType: 'announcement', targetId: (string) $id);
        return new Response(200, ['status' => 'deleted']);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> in Spaltenreihenfolge */
    private function validate(array $input): array
    {
        $fields = [];
        $title = trim((string) ($input['title'] ?? ''));
        $body = trim((string) ($input['body'] ?? ''));
        $link = trim((string) ($input['link'] ?? ''));
        $level = (string) ($input['level'] ?? 'info');
        $audience = (string) ($input['audience'] ?? 'all');
        $appId = $audience === 'app' ? (string) ($input['app_id'] ?? '') : null;
        $startsAt = (string) ($input['starts_at'] ?? '');
        $endsAt = (string) ($input['ends_at'] ?? '');

        if ($title === '' || mb_strlen($title) > 80) {
            $fields['title'] = 'Titel mit 1 bis 80 Zeichen.';
        }
        if (mb_strlen($body) > 500) {
            $fields['body'] = 'Text mit höchstens 500 Zeichen.';
        }
        // Gleiche Regel wie lib/announcements.js (safeLink).
        if ($link !== '' && !preg_match('#^(/(?!/)[A-Za-z0-9\-._~/?=&%]*|https://[A-Za-z0-9.\-]+(/[A-Za-z0-9\-._~/?=&%]*)?)$#', $link)) {
            $fields['link'] = 'Link muss mit / (diese Webseite) oder https:// beginnen.';
        }
        if (!in_array($level, self::LEVELS, true)) {
            $fields['level'] = 'Unbekannte Art.';
        }
        if (!in_array($audience, self::AUDIENCES, true)) {
            $fields['audience'] = 'Unbekannte Zielgruppe.';
        }
        if ($appId !== null) {
            $statement = $this->pdo->prepare('SELECT 1 FROM apps WHERE id = ?');
            $statement->execute([$appId]);
            if (!$statement->fetchColumn()) {
                $fields['app_id'] = 'Bitte ein Spiel wählen.';
            }
        }
        $starts = $startsAt === '' ? $this->clock->datetime() : self::utc($startsAt);
        $ends = $endsAt === '' ? null : self::utc($endsAt);
        if ($starts === null) {
            $fields['starts_at'] = 'Ungültiger Beginn.';
        }
        if ($endsAt !== '' && ($ends === null || ($starts !== null && $ends <= $starts))) {
            $fields['ends_at'] = 'Das Ende muss nach dem Beginn liegen.';
        }
        if ($fields !== []) {
            throw new HttpError(422, 'validation', ['fields' => $fields]);
        }

        return [
            'title' => $title, 'body' => $body, 'link' => $link === '' ? null : $link, 'level' => $level,
            'audience' => $audience, 'app_id' => $appId, 'starts_at' => $starts, 'ends_at' => $ends,
        ];
    }

    /** Erwartet UTC wie „2026-10-23T18:00:00Z“ oder „2026-10-23 18:00:00“. */
    private static function utc(string $value): ?string
    {
        $value = str_replace('T', ' ', rtrim(substr($value, 0, 20), 'Z'));
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', strlen($value) === 16 ? "$value:00" : $value, new \DateTimeZone('UTC'));
        return $date === false ? null : $date->format('Y-m-d H:i:s');
    }

    private function exists(int $id): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM announcements WHERE id = ?');
        $statement->execute([$id]);
        return (bool) $statement->fetchColumn();
    }
}
