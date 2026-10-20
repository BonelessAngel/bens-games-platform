<?php

declare(strict_types=1);

namespace BensGames;

use PDO;
use PDOException;

/**
 * Registrierung, E-Mail-Bestätigung, Anmeldung und Abmeldung (Phase 3.2).
 *
 * Grundsätze:
 * - Antworten verraten nicht, ob eine E-Mail-Adresse schon registriert ist.
 * - Öffentliche Registrierung erzeugt nur normale Nutzerkonten ohne Rechte.
 * - Gespeichert werden nur Hashes von Passwörtern, Links und Sitzungen sowie gekürzte IP-Adressen.
 */
final class Accounts
{
    public const VERIFY_LIFETIME = 86400; // Bestätigungslink 24 Stunden gültig
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
    ) {
    }

    /** @param array<string, mixed> $input */
    public function register(array $input, Request $request): Response
    {
        $ip = Security::ipPrefix($request->ip) ?? 'unbekannt';
        if (!$this->limiter->hit('register:ip', $ip, 10, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }

        $email = trim((string) ($input['email'] ?? ''));
        $name = trim((string) ($input['display_name'] ?? ''));
        $password = (string) ($input['password'] ?? '');

        $fields = [];
        if (mb_strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $fields['email'] = 'Bitte gib eine gültige E-Mail-Adresse ein.';
        }
        if (!preg_match('/^[\p{L}\p{N}][\p{L}\p{N} _.\-]{1,22}[\p{L}\p{N}]$/u', $name)) {
            $fields['display_name'] = 'Der Name braucht 3 bis 24 Zeichen: Buchstaben, Ziffern, Leerzeichen, Punkt, Binde- oder Unterstrich.';
        }
        if (mb_strlen($password) < self::PASSWORD_MIN || mb_strlen($password) > self::PASSWORD_MAX) {
            $fields['password'] = 'Das Passwort braucht mindestens ' . self::PASSWORD_MIN . ' Zeichen.';
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
                $userId = (int) $this->pdo->lastInsertId();
                $this->audit->log('user.registered', $request, actorUserId: $userId, targetType: 'user', targetId: (string) $userId);
                $this->sendVerification($userId, $email, $name);
            } catch (PDOException $e) {
                if ($e->getCode() !== '23000') {
                    throw $e;
                }
                // Gleichzeitige Registrierung derselben Adresse: wie „schon vorhanden“ behandeln.
            }
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
        $token = (string) ($input['token'] ?? '');
        if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
            throw new HttpError(400, 'invalid_token');
        }

        $statement = $this->pdo->prepare(
            "SELECT id, user_id FROM email_tokens
             WHERE token_hash = ? AND purpose = 'verify' AND used_at IS NULL AND expires_at > ?"
        );
        $statement->execute([Security::hashToken($token), $this->clock->datetime()]);
        $row = $statement->fetch();
        if (!$row) {
            throw new HttpError(400, 'invalid_token');
        }

        $now = $this->clock->datetime();
        $this->pdo->prepare('UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND purpose = \'verify\' AND used_at IS NULL')->execute([$now, $row['user_id']]);
        $this->pdo->prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')->execute([$now, $row['user_id']]);
        $this->audit->log('user.email_verified', $request, actorUserId: (int) $row['user_id'], targetType: 'user', targetId: (string) $row['user_id']);

        return new Response(200, ['status' => 'verified']);
    }

    /** @param array<string, mixed> $input */
    public function resendVerification(array $input, Request $request): Response
    {
        $normalized = mb_strtolower(trim((string) ($input['email'] ?? '')));
        $ip = Security::ipPrefix($request->ip) ?? 'unbekannt';
        if (!$this->limiter->hit('resend:ip', $ip, 10, 3600)) {
            throw new HttpError(429, 'too_many_attempts');
        }
        $user = $normalized === '' ? null : $this->findByEmail($normalized);
        if ($user !== null && $user['email_verified_at'] === null && $this->limiter->hit('resend:email', $normalized, 3, 3600)) {
            $this->sendVerification((int) $user['id'], $user['email'], $user['display_name']);
        }
        return new Response(202, ['status' => 'check_email']);
    }

    /** @param array<string, mixed> $input */
    public function login(array $input, Request $request): Response
    {
        $normalized = mb_strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $ip = Security::ipPrefix($request->ip) ?? 'unbekannt';

        $allowedIp = $this->limiter->hit('login:ip', $ip, 30, 900);
        $allowedEmail = $this->limiter->hit('login:email', $normalized, 10, 900);
        if (!$allowedIp || !$allowedEmail) {
            $this->audit->log('user.login_blocked', $request);
            throw new HttpError(429, 'too_many_attempts');
        }

        $user = $normalized === '' ? null : $this->findByEmail($normalized);
        // Auch ohne Konto ein Passwort prüfen, damit die Antwortzeit nichts verrät.
        $valid = password_verify($password, $user['password_hash'] ?? self::dummyHash()) && $user !== null;

        if (!$valid) {
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
        if (Security::needsRehash($user['password_hash'])) {
            $this->pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([Security::hashPassword($password), $userId]);
        }
        $this->pdo->prepare('UPDATE users SET last_login_at = ? WHERE id = ?')->execute([$this->clock->datetime(), $userId]);
        $this->limiter->clear('login:email', $normalized);

        $session = $this->sessions->create($userId, $request);
        $this->audit->log('user.login', $request, actorUserId: $userId, targetType: 'user', targetId: (string) $userId);

        return (new Response(200, ['user' => self::publicUser($user), 'csrf' => $session['csrf']]))
            ->withCookie(Sessions::COOKIE, $session['token']);
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
        return new Response(200, ['user' => self::publicUser($session), 'csrf' => $session['csrf_token']]);
    }

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
        ];
    }

    /** @return array<string, mixed>|null */
    private function findByEmail(string $normalized): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM users WHERE email_normalized = ?');
        $statement->execute([$normalized]);
        return $statement->fetch() ?: null;
    }

    private function sendVerification(int $userId, string $email, string $name): void
    {
        $token = Security::randomToken();
        $this->pdo->prepare(
            "INSERT INTO email_tokens (user_id, purpose, token_hash, created_at, expires_at) VALUES (?, 'verify', ?, ?, ?)"
        )->execute([$userId, Security::hashToken($token), $this->clock->datetime(), $this->clock->datetime(self::VERIFY_LIFETIME)]);

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

    private static function dummyHash(): string
    {
        static $hash = null;
        return $hash ??= Security::hashPassword(Security::randomToken());
    }
}
