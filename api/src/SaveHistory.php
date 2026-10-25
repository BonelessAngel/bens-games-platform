<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Kurzer Verlauf der Spielstände im Konto – für die Spielstand-Hilfe in der Zentrale („mein Fortschritt ist weg“).
 *
 * - Bevor ein Spielstand überschrieben wird, bleibt der bisherige als Verlaufseintrag erhalten,
 *   höchstens alle 6 Stunden einer, höchstens 10 je Konto und Spiel, höchstens 30 Tage (Cleanup).
 * - Wiederherstellen geht nur in der Zentrale mit ausdrücklicher Bestätigung und landet im Protokoll.
 *   Der wiederhergestellte Stand bekommt einen neuen Zeitstempel, damit ihn alle Geräte übernehmen.
 */
final class SaveHistory
{
    public const KEEP = 10;
    public const KEEP_DAYS = 30;
    private const GAP_SECONDS = 6 * 3600;

    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** Hält den bisherigen Stand fest, bevor er überschrieben wird. @param array<string, mixed> $current Zeile aus game_saves */
    public function remember(int $userId, string $appId, array $current, string $reason = 'update'): void
    {
        if ($reason === 'update') {
            $recent = $this->pdo->prepare('SELECT 1 FROM game_save_history WHERE user_id = ? AND app_id = ? AND saved_at > ? LIMIT 1');
            $recent->execute([$userId, $appId, $this->clock->datetime(-self::GAP_SECONDS)]);
            if ($recent->fetchColumn()) {
                return;
            }
        }
        $this->pdo->prepare(
            'INSERT INTO game_save_history (user_id, app_id, data, client_time, size, saved_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$userId, $appId, $current['data'], (int) $current['client_time'], strlen((string) $current['data']), $this->clock->datetime(), $reason]);
        // Nur die neuesten Einträge behalten.
        $old = $this->pdo->prepare('SELECT id FROM game_save_history WHERE user_id = ? AND app_id = ? ORDER BY saved_at DESC, id DESC LIMIT 100 OFFSET ' . self::KEEP);
        $old->execute([$userId, $appId]);
        $ids = $old->fetchAll(PDO::FETCH_COLUMN);
        if ($ids !== []) {
            $this->pdo->prepare('DELETE FROM game_save_history WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')')->execute($ids);
        }
    }

    public function forget(int $userId, string $appId): void
    {
        $this->pdo->prepare('DELETE FROM game_save_history WHERE user_id = ? AND app_id = ?')->execute([$userId, $appId]);
    }

    /** Aktuelle Spielstände und Verlauf eines Kontos (ohne den Inhalt selbst, nur mit kurzer Zusammenfassung). @return list<array<string, mixed>> */
    public function overview(int $userId): array
    {
        $saves = $this->pdo->prepare(
            'SELECT s.app_id, a.name, s.data, s.client_time, s.size, s.updated_at FROM game_saves s JOIN apps a ON a.id = s.app_id WHERE s.user_id = ? ORDER BY a.sort_order, a.name'
        );
        $saves->execute([$userId]);
        $history = $this->pdo->prepare('SELECT id, data, client_time, size, saved_at, reason FROM game_save_history WHERE user_id = ? AND app_id = ? ORDER BY saved_at DESC, id DESC');
        return array_map(function (array $save) use ($history, $userId): array {
            $history->execute([$userId, $save['app_id']]);
            return [
                'app_id' => $save['app_id'],
                'name' => $save['name'],
                'current' => ['updated_at' => $save['updated_at'], 'size' => (int) $save['size'], 'summary' => self::summary($save['app_id'], $save['data'])],
                'history' => array_map(static fn (array $h): array => [
                    'id' => (int) $h['id'],
                    'saved_at' => $h['saved_at'],
                    'size' => (int) $h['size'],
                    'reason' => $h['reason'],
                    'summary' => self::summary($save['app_id'], $h['data']),
                ], $history->fetchAll()),
            ];
        }, $saves->fetchAll());
    }

    /**
     * Stellt einen älteren Stand wieder her. Der aktuelle Stand landet vorher selbst im Verlauf.
     * @return array{app_id: string, client_time: int}
     */
    public function restore(int $userId, int $historyId): array
    {
        $statement = $this->pdo->prepare('SELECT app_id, data FROM game_save_history WHERE id = ? AND user_id = ?');
        $statement->execute([$historyId, $userId]);
        $old = $statement->fetch();
        if (!$old) {
            throw new HttpError(404, 'not_found');
        }
        $current = $this->pdo->prepare('SELECT data, client_time FROM game_saves WHERE user_id = ? AND app_id = ?');
        $current->execute([$userId, $old['app_id']]);
        $now = $current->fetch();
        if ($now) {
            $this->remember($userId, $old['app_id'], $now, 'before_restore');
        }
        // Neuer Zeitstempel: so gewinnt der wiederhergestellte Stand auf allen Geräten.
        $time = max($this->clock->now() * 1000, $now ? (int) $now['client_time'] + 1 : 0);
        $this->pdo->prepare(
            'INSERT INTO game_saves (user_id, app_id, data, client_time, size, updated_at) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE data = VALUES(data), client_time = VALUES(client_time), size = VALUES(size), updated_at = VALUES(updated_at)'
        )->execute([$userId, $old['app_id'], $old['data'], $time, strlen((string) $old['data']), $this->clock->datetime()]);
        return ['app_id' => $old['app_id'], 'client_time' => $time];
    }

    /** Kurze, lesbare Zusammenfassung eines Spielstands (nur für bekannte Spiele). */
    public static function summary(string $appId, string $data): ?string
    {
        $save = json_decode($data, true);
        if (!is_array($save)) {
            return null;
        }
        // Nova Bastion: Kampagne mit Sternen je Level, Kristallen und XP (der Dev-Spielstand zählt nicht).
        $camp = $save['camp'] ?? null;
        if ($appId === 'nova-bastion' && is_array($camp)) {
            $stars = is_array($camp['stars'] ?? null) ? array_sum(array_map('intval', $camp['stars'])) : 0;
            $levels = is_array($camp['stars'] ?? null) ? count(array_filter($camp['stars'], static fn ($s): bool => (int) $s > 0)) : 0;
            return sprintf('%d Einsätze geschafft · %d Sterne · %d Kristalle · %d XP', $levels, $stars, (int) ($camp['crystals'] ?? 0), (int) ($camp['xp'] ?? 0));
        }
        return null;
    }
}
