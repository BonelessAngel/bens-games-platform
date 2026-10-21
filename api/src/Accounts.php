<?php

declare(strict_types=1);

namespace BensGames;

use PDO;
use PDOException;

/**
 * Konten: Registrierung, E-Mail-Bestätigung, Anmeldung (Phase 3.2) sowie Passwort zurücksetzen
 * und ändern, Geräteverwaltung und Konto löschen (Phase 3.3).
 *
 * Grundsätze:
 * - Antworten verraten nicht, ob eine E-Mail-Adresse schon registriert ist.
 * - Öffentliche Registrierung erzeugt nur normale Nutzerkonten ohne Rechte.
 * - Gespeichert werden nur Hashes von Passwörtern, Links und Sitzungen sowie gekürzte IP-Adressen.
 * - Wer das Passwort ändert oder zurücksetzt, wird auf allen anderen Geräten abgemeldet.
 */
final class Accounts
{
    public const VERIFY_LIFETIME = 86400; // Bestätigungslink: 24 Stunden
    public const RESET_LIFETIME = 3600;   // Link zum Zurücksetzen: 1 Stunde
    public const CHALLENGE_LIFETIME = 300; // Zeit für den zweiten Faktor nach dem Passwort: 5 Minuten
    private const PASSWORD_MIN = 10;
    private const PASSWORD_MAX = 200;

    public function __construct(
        private PDO $pdo,
        private Clock $clock,
        private Mailer $mailer,
        private RateLimiter $limiter,
        private Sessions $sessions,
        private AuditLog $audit,
        private string $baseUrl,
        private TwoFactor $twoFactor,
        private Reauth $reauth,
        private ?Permissions $panelGate = null,
    ) {
    }

    /**
     * Nur in der Zentrale: Anmeldung nur mit Rechten für die Zentrale und eingeschalteter Zwei-Faktor-Anmeldung.
     * @param array<string, mixed> $user
     */
    private function assertPanelAccess(array $user, Request $request): void
    {
        if ($this->panelGate === null) {
            return;
        }
        if (!$this->panelGate->canEnterPanel((int) $user['id'])) {
            $this->audit->log('admin.login_denied', $request, targetType: 'user', targetId: (string) $user['id']);
            throw new HttpError(403, 'no_panel_access');
        }
        if (!TwoFactor::enabled($user)) {
            throw new HttpError(403, 'two_factor_setup_required');
        }
    }

    // --- Registrierung und Bestätigung ---------------------------------------

    /** @param array<string, mixed> $input */
    public function register(array $input, Request $request): Response
    {
        $this->limit('register:ip', self::ip($request), 10, 3600);

        $email = trim((string) ($input['email'] ?? ''));
        $name = trim((string) ($input['display_name'] ?? ''));
        $password = (string) ($input['password'] ?? '');

        $fields = [];
        if (mb_strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $fields['email'] = 'Bitte gib eine gültige E-Mail-Adresse ein.';
        }
        $nameError = Names::formatError($name) ?? ($this->nameTaken($name) ? 'Dieser Name ist schon vergeben.' : null);
        if ($nameError !== null) {
            $fields['display_name'] = $nameError;
        }
        if (($passwordError = self::passwordError($password)) !== null) {
            $fields['password'] = $passwordError;
        }
        if ($fields !== []) {
            throw new HttpError(422, 'validation', ['fields' => $fields]);
        }

        $normalized = mb_strtolower($email);
        $existing = $this->findByEmail($normalized);

        if ($existing === null) {
            try {
                $this->pdo->prepare(
                    'INSERT INTO users (email, email_normalized, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)'
                )->execute([$email, $normalized, $name, Security::hashPassword($password), $this->clock->datetime()]);
            } catch (PDOException $e) {
                if ($e->getCode() !== '23000') {
                    throw $e;
                }
                // Gleichzeitig vergeben: Name melden, eine doppelte E-Mail aber nicht verraten.
                if ($this->nameTaken($name)) {
                    throw new HttpError(422, 'validation', ['fields' => ['display_name' => 'Dieser Name ist schon vergeben.']]);
                }
                return new Response(202, ['status' => 'check_email']);
            }
            $userId = (int) $this->pdo->lastInsertId();
            $this->audit->log('user.registered', $request, actorUserId: $userId, targetType: 'user', targetId: (string) $userId);
            $this->sendVerification($userId, $email, $name);
        } elseif ($this->limiter->hit('register:email', $normalized, 3, 3600)) {
            if ($existing['email_verified_at'] === null) {
                $this->sendVerification((int) $existing['id'], $existing['email'], $existing['display_name']);
            } else {
                $this->mailer->send(
                    $existing['email'],
                    'Du hast bereits ein Konto bei Bens Games',
                    "Hallo {$existing['display_name']},\n\n"
                    . "jemand hat versucht, mit deiner E-Mail-Adresse ein neues Konto bei Bens Games anzulegen.\n"
                    . "Du hast aber schon eines. Melde dich einfach hier an:\n{$this->baseUrl}/konto/anmelden/\n\n"
                    . "Passwort vergessen? Hier kannst du ein neues festlegen:\n{$this->baseUrl}/konto/passwort-vergessen/\n\n"
                    . "Warst du das nicht, kannst du diese E-Mail ignorieren.\n\nBens Games"
                );
            }
        }

        // Immer dieselbe Antwort – egal ob neu, vorhanden oder bestätigt.
        return new Response(202, ['status' => 'check_email']);
    }

    /** @param array<string, mixed> $input */
    public function verify(array $input, Request $request): Response
    {
        $userId = $this->consumeToken((string) ($input['token'] ?? ''), 'verify');
        $this->pdo->prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')->execute([$this->clock->datetime(), $userId]);
        $this->audit->log('user.email_verified', $request, actorUserId: $userId, targetType: 'user', targetId: (string) $userId);
        return new Response(200, ['status' => 'verified']);
    }

    /** @param array<string, mixed> $input */
    public function resendVerification(array $input, Request $request): Response
    {
        $normalized = self::normalizeEmail($input['email'] ?? '');
        $this->limit('resend:ip', self::ip($request), 10, 3600);
        $user = $normalized === '' ? null : $this->findByEmail($normalized);
        if ($user !== null && $user['email_verified_at'] === null && $this->limiter->hit('resend:email', $normalized, 3, 3600)) {
            $this->sendVerification((int) $user['id'], $user['email'], $user['display_name']);
        }
        return new Response(202, ['status' => 'check_email']);
    }

    // --- Anmelden und Abmelden ----------------------------------------------

    /** @param array<string, mixed> $input */
    public function login(array $input, Request $request): Response
    {
        $normalized = self::normalizeEmail($input['email'] ?? '');
        $password = (string) ($input['password'] ?? '');
        $remember = ($input['remember'] ?? false) === true;
        $ip = self::ip($request);

        // Gezählt werden nur Fehlversuche – erfolgreiche Anmeldungen (z. B. mehrere Geräte im selben WLAN) sperren nie.
        if ($this->limiter->exceeded('login:ip', $ip, 30, 900) || $this->limiter->exceeded('login:email', $normalized, 10, 900)) {
            $this->audit->log('user.login_blocked', $request);
            throw new HttpError(429, 'too_many_attempts');
        }

        $user = $normalized === '' ? null : $this->findByEmail($normalized);
        // Auch ohne Konto ein Passwort prüfen, damit die Antwortzeit nichts verrät.
        $valid = password_verify($password, $user['password_hash'] ?? self::dummyHash()) && $user !== null;

        if (!$valid) {
            $this->limiter->hit('login:ip', $ip, 30, 900);
            $this->limiter->hit('login:email', $normalized, 10, 900);
            $this->audit->log('user.login_failed', $request, targetType: $user ? 'user' : null, targetId: $user ? (string) $user['id'] : null);
            throw new HttpError(401, 'invalid_credentials');
        }
        if ($user['status'] !== 'active') {
            throw new HttpError(403, 'account_locked');
        }
        if ($user['email_verified_at'] === null) {
            throw new HttpError(403, 'email_not_verified');
        }

        $userId = (int) $user['id'];
        $this->assertPanelAccess($user, $request);
        if (Security::needsRehash($user['password_hash'])) {
            $this->pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([Security::hashPassword($password), $userId]);
        }
        $this->limiter->clear('login:email', $normalized);

        // Mit Zwei-Faktor-Anmeldung gibt es erst nach dem Code aus der App eine Sitzung.
        if (TwoFactor::enabled($user)) {
            $challenge = Security::randomToken();
            $this->pdo->prepare(
                'INSERT INTO login_challenges (user_id, token_hash, remember, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
            )->execute([$userId, Security::hashToken($challenge), $remember ? 1 : 0, $this->clock->datetime(), $this->clock->datetime(self::CHALLENGE_LIFETIME)]);
            return new Response(200, ['status' => 'two_factor_required', 'challenge' => $challenge]);
        }

        return $this->startSession($user, $request, $remember, twoFactor: false);
    }

    /** Zweiter Schritt der Anmeldung: Code aus der App oder Wiederherstellungscode. @param array<string, mixed> $input */
    public function loginTwoFactor(array $input, Request $request): Response
    {
        $challenge = (string) ($input['challenge'] ?? '');
        if (!preg_match('/^[0-9a-f]{64}$/', $challenge)) {
            throw new HttpError(400, 'invalid_challenge');
        }
        $statement = $this->pdo->prepare(
            "SELECT c.id AS challenge_id, c.remember, u.* FROM login_challenges c JOIN users u ON u.id = c.user_id
             WHERE c.token_hash = ? AND c.used_at IS NULL AND c.expires_at > ? AND u.status = 'active'"
        );
        $statement->execute([Security::hashToken($challenge), $this->clock->datetime()]);
        $row = $statement->fetch();
        if (!$row) {
            throw new HttpError(400, 'invalid_challenge');
        }

        $this->assertPanelAccess($row, $request);
        $this->limit('2fa:challenge', $challenge, 5, self::CHALLENGE_LIFETIME);
        $this->limit('2fa:user', (string) $row['id'], 10, 900);
        if (!$this->twoFactor->verify($row, (string) ($input['code'] ?? ''))) {
            $this->audit->log('user.2fa_failed', $request, targetType: 'user', targetId: (string) $row['id']);
            throw new HttpError(403, 'wrong_code');
        }

        $this->pdo->prepare('UPDATE login_challenges SET used_at = ? WHERE id = ?')->execute([$this->clock->datetime(), $row['challenge_id']]);
        return $this->startSession($row, $request, (bool) $row['remember'], twoFactor: true);
    }

    /** @param array<string, mixed> $user */
    private function startSession(array $user, Request $request, bool $remember, bool $twoFactor): Response
    {
        $userId = (int) $user['id'];
        $this->pdo->prepare('UPDATE users SET last_login_at = ? WHERE id = ?')->execute([$this->clock->datetime(), $userId]);
        $session = $this->sessions->create($userId, $request, $remember);
        $this->audit->log('user.login', $request, actorUserId: $userId, targetType: 'user', targetId: (string) $userId, details: ['remember' => $remember, 'two_factor' => $twoFactor]);

        return (new Response(200, ['status' => 'logged_in', 'user' => self::publicUser($user), 'csrf' => $session['csrf']]))
            ->withCookie(Sessions::COOKIE, $session['token'], $session['expires']);
    }

    /** @param array<string, mixed> $session */
    public function logout(array $session, Request $request): Response
    {
        $this->sessions->revoke((int) $session['session_id']);
        $this->audit->log('user.logout', $request, actorUserId: (int) $session['id'], targetType: 'user', targetId: (string) $session['id']);
        return (new Response(200, ['status' => 'logged_out']))->withCookie(Sessions::COOKIE, '', -1);
    }

    /** @param array<string, mixed> $session */
    public function me(array $session): Response
    {
        $user = self::publicUser($session);
        if ($user['two_factor']) {
            $user['recovery_codes_left'] = $this->twoFactor->remainingRecoveryCodes($session);
        }
        return new Response(200, ['user' => $user, 'csrf' => $session['csrf_token']]);
    }

    // --- Passwort vergessen und ändern --------------------------------------

    /** @param array<string, mixed> $input */
    public function forgotPassword(array $input, Request $request): Response
    {
        $normalized = self::normalizeEmail($input['email'] ?? '');
        $this->limit('forgot:ip', self::ip($request), 10, 3600);
        $user = $normalized === '' ? null : $this->findByEmail($normalized);

        if ($user !== null && $user['status'] === 'active' && $this->limiter->hit('forgot:email', $normalized, 3, 3600)) {
            $token = $this->createToken((int) $user['id'], 'reset', self::RESET_LIFETIME);
            $this->mailer->send(
                $user['email'],
                'Neues Passwort für Bens Games',
                "Hallo {$user['display_name']},\n\n"
                . "mit diesem Link kannst du ein neues Passwort festlegen:\n\n"
                . "{$this->baseUrl}/konto/passwort-neu/#$token\n\n"
                . "Der Link ist eine Stunde gültig.\n"
                . "Hast du das nicht angefordert, kannst du diese E-Mail ignorieren – dein Passwort bleibt unverändert.\n\nBens Games"
            );
            $this->audit->log('user.password_reset_requested', $request, targetType: 'user', targetId: (string) $user['id']);
        }
        return new Response(202, ['status' => 'check_email']);
    }

    /** @param array<string, mixed> $input */
    public function resetPassword(array $input, Request $request): Response
    {
        $password = (string) ($input['password'] ?? '');
        if (($error = self::passwordError($password)) !== null) {
            throw new HttpError(422, 'validation', ['fields' => ['password' => $error]]);
        }
        $userId = $this->consumeToken((string) ($input['token'] ?? ''), 'reset');

        // Wer den Link aus dem Postfach nutzt, hat die Adresse damit auch bestätigt.
        $now = $this->clock->datetime();
        $this->pdo->prepare('UPDATE users SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')
            ->execute([Security::hashPassword($password), $now, $userId]);
        $this->sessions->revokeAll($userId);
        $this->audit->log('user.password_reset', $request, actorUserId: $userId, targetType: 'user', targetId: (string) $userId);
        $this->notifyPasswordChanged($userId);

        return new Response(200, ['status' => 'password_changed']);
    }

    /**
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input
     */
    public function changePassword(array $session, array $input, Request $request): Response
    {
        $this->reauth->assertPassword($session, (string) ($input['current_password'] ?? ''));
        $password = (string) ($input['new_password'] ?? '');
        if (($error = self::passwordError($password)) !== null) {
            throw new HttpError(422, 'validation', ['fields' => ['new_password' => $error]]);
        }

        $userId = (int) $session['id'];
        $this->pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([Security::hashPassword($password), $userId]);
        $this->sessions->revokeAll($userId, (int) $session['session_id']);
        $this->audit->log('user.password_changed', $request, actorUserId: $userId, targetType: 'user', targetId: (string) $userId);
        $this->notifyPasswordChanged($userId);

        return new Response(200, ['status' => 'password_changed']);
    }

    // --- Geräte (Sitzungen) -------------------------------------------------

    /** @param array<string, mixed> $session */
    public function listSessions(array $session): Response
    {
        $list = array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'current' => (int) $row['id'] === (int) $session['session_id'],
            'admin' => $row['scope'] === 'admin',
            'created_at' => $row['created_at'],
            'last_seen_at' => $row['last_seen_at'],
            'persistent' => (bool) $row['persistent'],
            'user_agent' => $row['user_agent'],
            'ip_prefix' => $row['ip_prefix'],
        ], $this->sessions->active((int) $session['id']));
        return new Response(200, ['sessions' => $list]);
    }

    /**
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input
     */
    public function revokeSession(array $session, array $input, Request $request): Response
    {
        $id = (int) ($input['id'] ?? 0);
        if (!$this->sessions->revoke($id, (int) $session['id'])) {
            throw new HttpError(404, 'not_found');
        }
        $this->audit->log('user.session_revoked', $request, actorUserId: (int) $session['id'], targetType: 'session', targetId: (string) $id);
        $response = new Response(200, ['status' => 'revoked']);
        return $id === (int) $session['session_id'] ? $response->withCookie(Sessions::COOKIE, '', -1) : $response;
    }

    /** @param array<string, mixed> $session */
    public function revokeOtherSessions(array $session, Request $request): Response
    {
        $count = $this->sessions->revokeAll((int) $session['id'], (int) $session['session_id']);
        $this->audit->log('user.sessions_revoked', $request, actorUserId: (int) $session['id'], targetType: 'user', targetId: (string) $session['id'], details: ['count' => $count]);
        return new Response(200, ['status' => 'revoked', 'count' => $count]);
    }

    // --- Konto löschen ------------------------------------------------------

    /**
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input
     */
    public function deleteAccount(array $session, array $input, Request $request): Response
    {
        $this->reauth->assertPassword($session, (string) ($input['password'] ?? ''));
        if (($input['confirm'] ?? false) !== true) {
            throw new HttpError(422, 'validation', ['fields' => ['confirm' => 'Bitte bestätige, dass du dein Konto löschen möchtest.']]);
        }

        $userId = (int) $session['id'];
        // Sitzungen und Links werden über ON DELETE CASCADE mit gelöscht.
        $this->pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
        $this->audit->log('user.deleted', $request, targetType: 'user', targetId: (string) $userId);
        $this->mailer->send(
            $session['email'],
            'Dein Konto bei Bens Games wurde gelöscht',
            "Hallo {$session['display_name']},\n\n"
            . "dein Konto bei Bens Games wurde gelöscht. Name, E-Mail-Adresse und Passwort sind entfernt.\n"
            . "Du kannst jederzeit ein neues Konto anlegen.\n\nBens Games"
        );

        return (new Response(200, ['status' => 'deleted']))->withCookie(Sessions::COOKIE, '', -1);
    }

    // --- Hilfen -------------------------------------------------------------

    /**
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    public static function publicUser(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'display_name' => $user['display_name'],
            'email_verified' => $user['email_verified_at'] !== null,
            'two_factor' => TwoFactor::enabled($user),
        ];
    }

    private static function passwordError(string $password): ?string
    {
        $length = mb_strlen($password);
        return $length < self::PASSWORD_MIN || $length > self::PASSWORD_MAX
            ? 'Das Passwort braucht mindestens ' . self::PASSWORD_MIN . ' Zeichen.'
            : null;
    }

    private static function normalizeEmail(mixed $email): string
    {
        return mb_strtolower(trim((string) $email));
    }

    private static function ip(Request $request): string
    {
        return Security::ipPrefix($request->ip) ?? 'unbekannt';
    }

    private function limit(string $kind, string $value, int $limit, int $windowSeconds): void
    {
        if (!$this->limiter->hit($kind, $value, $limit, $windowSeconds)) {
            throw new HttpError(429, 'too_many_attempts');
        }
    }

    private function nameTaken(string $name): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM users WHERE display_name = ?');
        $statement->execute([$name]);
        return (bool) $statement->fetchColumn();
    }

    /** @return array<string, mixed>|null */
    private function findByEmail(string $normalized): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM users WHERE email_normalized = ?');
        $statement->execute([$normalized]);
        return $statement->fetch() ?: null;
    }

    private function createToken(int $userId, string $purpose, int $lifetime): string
    {
        $token = Security::randomToken();
        $this->pdo->prepare(
            'INSERT INTO email_tokens (user_id, purpose, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
        )->execute([$userId, $purpose, Security::hashToken($token), $this->clock->datetime(), $this->clock->datetime($lifetime)]);
        return $token;
    }

    /** Löst einen Link ein und macht alle Links desselben Zwecks für das Konto ungültig. @return int Konto */
    private function consumeToken(string $token, string $purpose): int
    {
        if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
            throw new HttpError(400, 'invalid_token');
        }
        $statement = $this->pdo->prepare(
            "SELECT t.user_id FROM email_tokens t JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = ? AND t.purpose = ? AND t.used_at IS NULL AND t.expires_at > ? AND u.status = 'active'"
        );
        $statement->execute([Security::hashToken($token), $purpose, $this->clock->datetime()]);
        $userId = $statement->fetchColumn();
        if ($userId === false) {
            throw new HttpError(400, 'invalid_token');
        }
        $this->pdo->prepare('UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL')
            ->execute([$this->clock->datetime(), $userId, $purpose]);
        return (int) $userId;
    }

    private function sendVerification(int $userId, string $email, string $name): void
    {
        $token = $this->createToken($userId, 'verify', self::VERIFY_LIFETIME);
        $this->mailer->send(
            $email,
            'Bitte bestätige deine E-Mail-Adresse',
            "Hallo $name,\n\n"
            . "willkommen bei Bens Games! Bitte bestätige deine E-Mail-Adresse mit diesem Link:\n\n"
            . "{$this->baseUrl}/konto/bestaetigen/#$token\n\n"
            . "Der Link ist 24 Stunden gültig.\n"
            . "Hast du dich nicht registriert, kannst du diese E-Mail ignorieren.\n\nBens Games"
        );
    }

    private function notifyPasswordChanged(int $userId): void
    {
        $statement = $this->pdo->prepare('SELECT email, display_name FROM users WHERE id = ?');
        $statement->execute([$userId]);
        $user = $statement->fetch();
        if (!$user) {
            return;
        }
        $this->mailer->send(
            $user['email'],
            'Dein Passwort bei Bens Games wurde geändert',
            "Hallo {$user['display_name']},\n\n"
            . "das Passwort für dein Konto bei Bens Games wurde gerade geändert. Andere Geräte wurden abgemeldet.\n\n"
            . "Warst du das nicht? Lege sofort ein neues Passwort fest:\n{$this->baseUrl}/konto/passwort-vergessen/\n\nBens Games"
        );
    }

    private static function dummyHash(): string
    {
        static $hash = null;
        return $hash ??= Security::hashPassword(Security::randomToken());
    }
}
