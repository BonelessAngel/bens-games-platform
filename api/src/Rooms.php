<?php

declare(strict_types=1);

namespace BensGames;

use PDO;
use Throwable;

/**
 * Räume für Mehrspieler-Partien (docs/raeume-api.md).
 *
 * Der Server ist ein neutraler „Schiedsrichter-Briefkasten“: Er verwaltet Räume, Plätze und eine geordnete Liste
 * von Aktionen. Die Spielregeln laufen in allen Spielern gleich (deterministisch) – der Server prüft nur Platz,
 * Größe und Tempo. Zufall kommt aus dem seed, den der Server beim Start vergibt.
 *
 * Jeder Platz hat ein Token (Header X-Room-Token); gespeichert wird nur sein Hash. Angemeldete werden ihrem Konto
 * zugeordnet und mit Anzeigename und Profilbild gezeigt, Gäste heißen „Gast 1234“. Freie Texte gibt es nicht.
 */
final class Rooms
{
    public const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    public const MAX_ACTION_BYTES = 4096;
    public const MAX_SETTINGS_BYTES = 2048;
    public const MAX_ACTIONS = 5000;
    public const POLL_LIMIT = 200;
    public const ONLINE_SECONDS = 15;
    public const LOBBY_IDLE_SECONDS = 1800;     // Lobby ohne Aktivität
    public const GAME_IDLE_SECONDS = 7200;      // Partie ohne Aktivität
    public const MAX_AGE_SECONDS = 86400;       // spätestens nach 24 Stunden weg

    public function __construct(private PDO $pdo, private Clock $clock, private RateLimiter $limiter)
    {
    }

    /**
     * @param array<string, mixed> $input {max_players, visibility, mode, settings}
     * @param array<string, mixed>|null $session
     */
    public function create(string $appId, array $input, ?array $session, Request $request): Response
    {
        $this->assertGame($appId);
        if (!$this->limiter->hit('rooms:create', $this->client($request, $session), 30, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }
        $options = $this->options($input);
        $this->removeExpired();
        $room = $this->insertRoom($appId, $options);
        return $this->enter($room['id'], $session);
    }

    /**
     * @param array<string, mixed> $input {code}
     * @param array<string, mixed>|null $session
     */
    public function join(string $appId, array $input, ?array $session, Request $request): Response
    {
        $this->assertGame($appId);
        // Begrenzt das Raten von Codes.
        if (!$this->limiter->hit('rooms:join', $this->client($request, $session), 60, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }
        $code = strtoupper(trim((string) ($input['code'] ?? '')));
        if (!preg_match('/^[A-Z0-9]{6}$/', $code)) {
            throw new HttpError(422, 'validation', ['fields' => ['code' => 'Der Code hat 6 Zeichen.']]);
        }
        $room = $this->roomByCode($appId, $code);
        return $this->enter((int) $room['id'], $session);
    }

    /**
     * Schnelles Spiel: freien öffentlichen Raum mit gleichem Modus finden oder einen neuen anlegen.
     * @param array<string, mixed> $input {mode, max_players}
     * @param array<string, mixed>|null $session
     */
    public function quick(string $appId, array $input, ?array $session, Request $request): Response
    {
        $this->assertGame($appId);
        if (!$this->limiter->hit('rooms:quick', $this->client($request, $session), 60, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }
        $options = $this->options(['visibility' => 'public'] + $input);
        $this->removeExpired();
        $statement = $this->pdo->prepare(
            "SELECT r.id FROM rooms r
             WHERE r.app_id = ? AND r.visibility = 'public' AND r.status = 'waiting' AND r.mode = ? AND r.max_players = ?
               AND r.updated_at >= ?
               AND (SELECT COUNT(*) FROM room_players p WHERE p.room_id = r.id AND p.left_at IS NULL) < r.max_players
               AND EXISTS (SELECT 1 FROM room_players p WHERE p.room_id = r.id AND p.left_at IS NULL AND p.last_seen >= ?)
             ORDER BY r.created_at, r.id LIMIT 5"
        );
        $statement->execute([
            $appId, $options['mode'], $options['max_players'],
            $this->clock->datetime(-self::LOBBY_IDLE_SECONDS), $this->clock->datetime(-self::ONLINE_SECONDS),
        ]);
        foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $roomId) {
            try {
                return $this->enter((int) $roomId, $session);
            } catch (HttpError $e) {
                if ($e->status !== 409) {
                    throw $e;
                }
                // Inzwischen voll oder gestartet – den nächsten versuchen.
            }
        }
        $room = $this->insertRoom($appId, $options);
        return $this->enter($room['id'], $session);
    }

    /** @param array<string, string> $query {code, after} */
    public function poll(string $appId, array $query, Request $request): Response
    {
        $code = strtoupper((string) ($query['code'] ?? ''));
        [$room, $seat] = $this->seat($appId, $code, $request);
        // Nur alle paar Sekunden schreiben, damit das Abfragen jede Sekunde die Datenbank nicht belastet.
        if ($seat['last_seen'] < $this->clock->datetime(-5)) {
            $this->pdo->prepare('UPDATE room_players SET last_seen = ? WHERE room_id = ? AND seat = ?')
                ->execute([$this->clock->datetime(), $room['id'], $seat['seat']]);
        }
        $after = max(0, (int) ($query['after'] ?? 0));
        $statement = $this->pdo->prepare('SELECT seq, seat, data, created_at FROM room_actions WHERE room_id = ? AND seq > ? ORDER BY seq LIMIT ' . self::POLL_LIMIT);
        $statement->execute([$room['id'], $after]);
        $actions = array_map(fn (array $row): array => [
            'seq' => (int) $row['seq'],
            'seat' => (int) $row['seat'],
            'data' => json_decode((string) $row['data'], true),
            'at' => str_replace(' ', 'T', (string) $row['created_at']) . 'Z',
        ], $statement->fetchAll());
        return new Response(200, ['room' => $this->describe((int) $room['id']), 'actions' => $actions, 'last_seq' => (int) $room['action_count']]);
    }

    /** @param array<string, mixed> $input {ready} */
    public function ready(string $appId, array $input, Request $request): Response
    {
        [$room, $seat] = $this->seat($appId, (string) ($input['code'] ?? ''), $request);
        if ($room['status'] !== 'waiting') {
            throw new HttpError(409, 'already_started');
        }
        $this->pdo->prepare('UPDATE room_players SET ready = ? WHERE room_id = ? AND seat = ?')
            ->execute([($input['ready'] ?? false) === true ? 1 : 0, $room['id'], $seat['seat']]);
        $this->touch((int) $room['id']);
        return new Response(200, ['room' => $this->describe((int) $room['id'])]);
    }

    public function start(string $appId, array $input, Request $request): Response
    {
        [$room, $seat] = $this->seat($appId, (string) ($input['code'] ?? ''), $request);
        $this->assertHost($room, $seat);
        if ($room['status'] !== 'waiting') {
            throw new HttpError(409, 'already_started');
        }
        if ($this->activeCount((int) $room['id']) < 2) {
            throw new HttpError(409, 'not_enough_players');
        }
        $statement = $this->pdo->prepare("UPDATE rooms SET status = 'playing', seed = ?, updated_at = ? WHERE id = ? AND status = 'waiting'");
        $statement->execute([random_int(1, 2147483646), $this->clock->datetime(), $room['id']]);
        if ($statement->rowCount() !== 1) {
            throw new HttpError(409, 'already_started');
        }
        return new Response(200, ['room' => $this->describe((int) $room['id'])]);
    }

    /** @param array<string, mixed> $input {data} */
    public function action(string $appId, array $input, Request $request): Response
    {
        [$room, $seat] = $this->seat($appId, (string) ($input['code'] ?? ''), $request);
        if ($room['status'] !== 'playing') {
            throw new HttpError(409, 'not_playing');
        }
        if ($seat['left_at'] !== null) {
            throw new HttpError(403, 'not_in_room');
        }
        // Höchstens etwa 10 Aktionen pro Sekunde je Platz.
        if (!$this->limiter->hit('rooms:action', $room['id'] . ':' . $seat['seat'], 30, 3)) {
            throw new HttpError(429, 'too_many_attempts');
        }
        $data = $input['data'] ?? null;
        if (!is_array($data)) {
            throw new HttpError(422, 'validation', ['fields' => ['data' => 'data muss ein Objekt sein.']]);
        }
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false || strlen($json) > self::MAX_ACTION_BYTES) {
            throw new HttpError(413, 'too_large', ['max_bytes' => self::MAX_ACTION_BYTES]);
        }

        $this->pdo->beginTransaction();
        try {
            $lock = $this->pdo->prepare('SELECT action_count FROM rooms WHERE id = ? FOR UPDATE');
            $lock->execute([$room['id']]);
            $seq = (int) $lock->fetchColumn() + 1;
            if ($seq > self::MAX_ACTIONS) {
                throw new HttpError(409, 'too_many_actions');
            }
            $this->pdo->prepare('INSERT INTO room_actions (room_id, seq, seat, data, created_at) VALUES (?, ?, ?, ?, ?)')
                ->execute([$room['id'], $seq, $seat['seat'], $json, $this->clock->datetime()]);
            $this->pdo->prepare('UPDATE rooms SET action_count = ?, updated_at = ? WHERE id = ?')
                ->execute([$seq, $this->clock->datetime(), $room['id']]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return new Response(200, ['seq' => $seq]);
    }

    /**
     * Nur Gastgeber: Partie beenden und Ergebnis festhalten (Platz und Punkte je Platz).
     * @param array<string, mixed> $input {results: list<{seat, place, score}>}
     */
    public function finish(string $appId, array $input, Request $request): Response
    {
        [$room, $seat] = $this->seat($appId, (string) ($input['code'] ?? ''), $request);
        $this->assertHost($room, $seat);
        if ($room['status'] === 'finished') {
            return new Response(200, ['room' => $this->describe((int) $room['id'])]);
        }
        if ($room['status'] !== 'playing') {
            throw new HttpError(409, 'not_playing');
        }
        $results = $input['results'] ?? [];
        if (!is_array($results) || count($results) > (int) $room['max_players']) {
            throw new HttpError(422, 'validation', ['fields' => ['results' => 'results muss eine kurze Liste sein.']]);
        }
        $update = $this->pdo->prepare('UPDATE room_players SET place = ?, score = ? WHERE room_id = ? AND seat = ?');
        foreach ($results as $result) {
            if (!is_array($result) || !is_int($result['seat'] ?? null)) {
                continue;
            }
            $place = is_int($result['place'] ?? null) ? max(1, min(8, $result['place'])) : null;
            $score = is_int($result['score'] ?? null) ? max(0, min(1_000_000_000, $result['score'])) : null;
            $update->execute([$place, $score, $room['id'], $result['seat']]);
        }
        $this->pdo->prepare("UPDATE rooms SET status = 'finished', updated_at = ? WHERE id = ?")->execute([$this->clock->datetime(), $room['id']]);
        return new Response(200, ['room' => $this->describe((int) $room['id'])]);
    }

    /** Platz verlassen: in der Lobby wird er frei, in der Partie gilt man als „verlassen“. Gastgeber-Rolle wandert weiter. */
    public function leave(string $appId, array $input, Request $request): Response
    {
        [$room, $seat] = $this->seat($appId, (string) ($input['code'] ?? ''), $request);
        $roomId = (int) $room['id'];
        if ($room['status'] === 'waiting') {
            $this->pdo->prepare('DELETE FROM room_players WHERE room_id = ? AND seat = ?')->execute([$roomId, $seat['seat']]);
        } else {
            $this->pdo->prepare('UPDATE room_players SET left_at = ? WHERE room_id = ? AND seat = ?')
                ->execute([$this->clock->datetime(), $roomId, $seat['seat']]);
        }
        $next = $this->pdo->prepare('SELECT seat FROM room_players WHERE room_id = ? AND left_at IS NULL ORDER BY seat LIMIT 1');
        $next->execute([$roomId]);
        $nextSeat = $next->fetchColumn();
        if ($nextSeat === false) {
            $this->pdo->prepare('DELETE FROM rooms WHERE id = ?')->execute([$roomId]);
            return new Response(200, ['left' => true]);
        }
        if ((int) $room['host_seat'] === (int) $seat['seat']) {
            $this->pdo->prepare('UPDATE rooms SET host_seat = ? WHERE id = ?')->execute([(int) $nextSeat, $roomId]);
        }
        $this->touch($roomId);
        return new Response(200, ['left' => true]);
    }

    /** Gastgeber entfernt jemanden – nur in der Lobby. @param array<string, mixed> $input {seat} */
    public function kick(string $appId, array $input, Request $request): Response
    {
        [$room, $seat] = $this->seat($appId, (string) ($input['code'] ?? ''), $request);
        $this->assertHost($room, $seat);
        if ($room['status'] !== 'waiting') {
            throw new HttpError(409, 'already_started');
        }
        $target = $input['seat'] ?? null;
        if (!is_int($target) || $target === (int) $seat['seat']) {
            throw new HttpError(422, 'validation', ['fields' => ['seat' => 'Diesen Platz kannst du nicht entfernen.']]);
        }
        $this->pdo->prepare('DELETE FROM room_players WHERE room_id = ? AND seat = ?')->execute([$room['id'], $target]);
        $this->touch((int) $room['id']);
        return new Response(200, ['room' => $this->describe((int) $room['id'])]);
    }

    /** Für die tägliche Aufräumrunde: abgelaufene Räume samt Plätzen und Aktionen löschen. */
    public function removeExpired(): int
    {
        $statement = $this->pdo->prepare(
            "DELETE FROM rooms
             WHERE created_at < ?
                OR (status = 'waiting' AND updated_at < ?)
                OR (status <> 'waiting' AND updated_at < ?)"
        );
        $statement->execute([
            $this->clock->datetime(-self::MAX_AGE_SECONDS),
            $this->clock->datetime(-self::LOBBY_IDLE_SECONDS),
            $this->clock->datetime(-self::GAME_IDLE_SECONDS),
        ]);
        return $statement->rowCount();
    }

    // ---------- intern ----------

    /** @return array{max_players: int, visibility: string, mode: string, settings: string} */
    private function options(array $input): array
    {
        $max = $input['max_players'] ?? 2;
        $visibility = $input['visibility'] ?? 'private';
        $mode = $input['mode'] ?? 'standard';
        $settings = $input['settings'] ?? [];
        $errors = [];
        if (!is_int($max) || $max < 2 || $max > 8) {
            $errors['max_players'] = 'Zwischen 2 und 8 Spielern.';
        }
        if (!in_array($visibility, ['private', 'public'], true)) {
            $errors['visibility'] = 'private oder public.';
        }
        if (!is_string($mode) || !preg_match('/^[a-z0-9_-]{1,24}$/', $mode)) {
            $errors['mode'] = 'Kurze Kennung aus a–z, 0–9, _ und -.';
        }
        $json = is_array($settings) ? json_encode((object) $settings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : false;
        if ($json === false || strlen($json) > self::MAX_SETTINGS_BYTES) {
            $errors['settings'] = 'Ein Objekt mit höchstens 2 KB.';
        }
        if ($errors !== []) {
            throw new HttpError(422, 'validation', ['fields' => $errors]);
        }
        return ['max_players' => $max, 'visibility' => $visibility, 'mode' => $mode, 'settings' => (string) $json];
    }

    /** @return array{id: int, code: string} */
    private function insertRoom(string $appId, array $options): array
    {
        $now = $this->clock->datetime();
        $insert = $this->pdo->prepare(
            'INSERT INTO rooms (code, app_id, status, mode, visibility, max_players, host_seat, settings, created_at, updated_at)
             VALUES (?, ?, \'waiting\', ?, ?, ?, 0, ?, ?, ?)'
        );
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $code = '';
            for ($i = 0; $i < 6; $i++) {
                $code .= self::CODE_CHARS[random_int(0, strlen(self::CODE_CHARS) - 1)];
            }
            try {
                $insert->execute([$code, $appId, $options['mode'], $options['visibility'], $options['max_players'], $options['settings'], $now, $now]);
                return ['id' => (int) $this->pdo->lastInsertId(), 'code' => $code];
            } catch (\PDOException $e) {
                if ((string) $e->getCode() !== '23000') {
                    throw $e;
                }
                // Code schon vergeben – neu würfeln.
            }
        }
        throw new HttpError(503, 'unavailable');
    }

    /**
     * Platz im Raum belegen (neu oder – für ein Konto, das schon drin ist – mit neuem Token zurück).
     * @param array<string, mixed>|null $session
     */
    private function enter(int $roomId, ?array $session): Response
    {
        $token = Security::randomToken();
        $now = $this->clock->datetime();
        $userId = $session === null ? null : (int) $session['id'];

        $this->pdo->beginTransaction();
        try {
            $lock = $this->pdo->prepare('SELECT id, status, max_players FROM rooms WHERE id = ? FOR UPDATE');
            $lock->execute([$roomId]);
            $room = $lock->fetch();
            if (!$room) {
                throw new HttpError(404, 'room_not_found');
            }
            $players = $this->pdo->prepare('SELECT seat, user_id, left_at FROM room_players WHERE room_id = ? ORDER BY seat');
            $players->execute([$roomId]);
            $rows = $players->fetchAll();

            $seat = null;
            if ($userId !== null) {
                foreach ($rows as $row) {
                    if ((int) $row['user_id'] === $userId && $row['left_at'] === null) {
                        $seat = (int) $row['seat'];
                    }
                }
            }
            if ($seat !== null) {
                // Dasselbe Konto kommt zurück (z. B. nach Neuladen auf einem anderen Gerät): neues Token für den Platz.
                $this->pdo->prepare('UPDATE room_players SET token_hash = ?, last_seen = ? WHERE room_id = ? AND seat = ?')
                    ->execute([Security::hashToken($token), $now, $roomId, $seat]);
            } else {
                if ($room['status'] !== 'waiting') {
                    throw new HttpError(409, 'already_started');
                }
                $taken = array_map(static fn (array $row): int => (int) $row['seat'], $rows);
                $active = count(array_filter($rows, static fn (array $row): bool => $row['left_at'] === null));
                if ($active >= (int) $room['max_players']) {
                    throw new HttpError(409, 'room_full');
                }
                $seat = 0;
                while (in_array($seat, $taken, true)) {
                    $seat++;
                }
                $this->pdo->prepare(
                    'INSERT INTO room_players (room_id, seat, token_hash, user_id, guest_name, ready, last_seen) VALUES (?, ?, ?, ?, ?, 0, ?)'
                )->execute([$roomId, $seat, Security::hashToken($token), $userId, $userId === null ? 'Gast ' . random_int(1000, 9999) : null, $now]);
                if ($rows === []) {
                    $this->pdo->prepare('UPDATE rooms SET host_seat = ? WHERE id = ?')->execute([$seat, $roomId]);
                }
            }
            $this->pdo->prepare('UPDATE rooms SET updated_at = ? WHERE id = ?')->execute([$now, $roomId]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return new Response(200, ['room' => $this->describe($roomId), 'you' => ['seat' => $seat, 'token' => $token]]);
    }

    /** @return array<string, mixed> */
    private function roomByCode(string $appId, string $code): array
    {
        $statement = $this->pdo->prepare('SELECT * FROM rooms WHERE code = ? AND app_id = ?');
        $statement->execute([$code, $appId]);
        $room = $statement->fetch();
        if (!$room || $this->expired($room)) {
            if ($room) {
                $this->pdo->prepare('DELETE FROM rooms WHERE id = ?')->execute([$room['id']]);
            }
            throw new HttpError(404, 'room_not_found');
        }
        return $room;
    }

    /**
     * Raum und eigener Platz über das X-Room-Token. Der Code ist optional (poll schickt ihn mit) und muss dann passen.
     * @return array{0: array<string, mixed>, 1: array<string, mixed>}
     */
    private function seat(string $appId, string $code, Request $request): array
    {
        $token = $request->header('x-room-token');
        if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
            throw new HttpError(403, 'not_in_room');
        }
        $statement = $this->pdo->prepare(
            'SELECT r.*, p.seat AS my_seat, p.left_at AS my_left_at, p.last_seen AS my_last_seen
             FROM room_players p JOIN rooms r ON r.id = p.room_id
             WHERE p.token_hash = ? AND r.app_id = ?'
        );
        $statement->execute([Security::hashToken($token), $appId]);
        $row = $statement->fetch();
        if (!$row) {
            throw new HttpError(403, 'not_in_room');
        }
        $code = strtoupper(trim($code));
        if ($code !== '' && $code !== $row['code']) {
            throw new HttpError(403, 'not_in_room');
        }
        if ($this->expired($row)) {
            $this->pdo->prepare('DELETE FROM rooms WHERE id = ?')->execute([$row['id']]);
            throw new HttpError(404, 'room_not_found');
        }
        $seat = ['seat' => (int) $row['my_seat'], 'left_at' => $row['my_left_at'], 'last_seen' => $row['my_last_seen']];
        return [$row, $seat];
    }

    /** @return array<string, mixed> öffentliche Raumdaten für die Mitspieler */
    private function describe(int $roomId): array
    {
        $statement = $this->pdo->prepare('SELECT * FROM rooms WHERE id = ?');
        $statement->execute([$roomId]);
        $room = $statement->fetch();
        $players = $this->pdo->prepare(
            'SELECT p.seat, p.guest_name, p.ready, p.left_at, p.last_seen, p.user_id, u.display_name, u.avatar, u.avatar_color
             FROM room_players p LEFT JOIN users u ON u.id = p.user_id
             WHERE p.room_id = ? ORDER BY p.seat'
        );
        $players->execute([$roomId]);
        $online = $this->clock->datetime(-self::ONLINE_SECONDS);
        return [
            'code' => $room['code'],
            'status' => $room['status'],
            'mode' => $room['mode'],
            'visibility' => $room['visibility'],
            'max_players' => (int) $room['max_players'],
            'host_seat' => (int) $room['host_seat'],
            'seed' => $room['status'] === 'waiting' || $room['seed'] === null ? null : (int) $room['seed'],
            'settings' => json_decode((string) $room['settings'], true) ?: (object) [],
            'players' => array_map(static fn (array $row): array => [
                'seat' => (int) $row['seat'],
                'name' => $row['display_name'] !== null ? (string) $row['display_name'] : (string) ($row['guest_name'] ?? 'Gast'),
                'avatar_url' => $row['avatar'] !== null ? "/avatars/{$row['avatar']}-{$row['avatar_color']}.svg" : null,
                'account' => $row['user_id'] !== null,
                'online' => $row['left_at'] === null && $row['last_seen'] >= $online,
                'ready' => (bool) $row['ready'],
                'left' => $row['left_at'] !== null,
            ], $players->fetchAll()),
        ];
    }

    private function expired(array $room): bool
    {
        if ($room['created_at'] < $this->clock->datetime(-self::MAX_AGE_SECONDS)) {
            return true;
        }
        $idle = $room['status'] === 'waiting' ? self::LOBBY_IDLE_SECONDS : self::GAME_IDLE_SECONDS;
        return $room['updated_at'] < $this->clock->datetime(-$idle);
    }

    private function assertHost(array $room, array $seat): void
    {
        if ((int) $room['host_seat'] !== (int) $seat['seat']) {
            throw new HttpError(403, 'not_host');
        }
    }

    private function activeCount(int $roomId): int
    {
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM room_players WHERE room_id = ? AND left_at IS NULL');
        $statement->execute([$roomId]);
        return (int) $statement->fetchColumn();
    }

    private function touch(int $roomId): void
    {
        $this->pdo->prepare('UPDATE rooms SET updated_at = ? WHERE id = ?')->execute([$this->clock->datetime(), $roomId]);
    }

    /** Wer zählt für die Versuchs-Grenzen: Konto oder gekürzte IP (nur als Hash im RateLimiter). */
    private function client(Request $request, ?array $session): string
    {
        return $session !== null ? 'user:' . $session['id'] : 'ip:' . (Security::ipPrefix($request->ip) ?? 'unbekannt');
    }

    private function assertGame(string $appId): void
    {
        $statement = $this->pdo->prepare("SELECT 1 FROM apps WHERE id = ? AND type = 'game'");
        $statement->execute([$appId]);
        if (!$statement->fetchColumn()) {
            throw new HttpError(404, 'unknown_game');
        }
    }
}
