<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Zwei-Faktor-Anmeldung per Authenticator-App (Phase 3.4) – Pflicht später für alle mit Rechten in der Zentrale.
 *
 * Ablauf: Einrichten (Passwort) → Schlüssel per QR-Code in die App → ersten Code bestätigen →
 * 10 Wiederherstellungscodes, die nur einmal angezeigt werden. Der Schlüssel liegt verschlüsselt
 * in der Datenbank, jeder Code gilt nur einmal.
 */
final class TwoFactor
{
    public const RECOVERY_CODES = 10;

    public function __construct(
        private PDO $pdo,
        private Clock $clock,
        private SecretBox $box,
        private string $appSecret,
        private Mailer $mailer,
        private AuditLog $audit,
        private Sessions $sessions,
        private Reauth $reauth,
    ) {
    }

    /** @param array<string, mixed> $user */
    public static function enabled(array $user): bool
    {
        return ($user['totp_enabled_at'] ?? null) !== null;
    }

    /**
     * Schritt 1: neuen Schlüssel erzeugen (noch nicht aktiv).
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input
     */
    public function setup(array $session, array $input, Request $request): Response
    {
        $this->reauth->assertPassword($session, (string) ($input['password'] ?? ''));
        if (self::enabled($session)) {
            throw new HttpError(409, 'already_enabled');
        }
        $secret = Totp::generateSecret();
        $this->pdo->prepare('UPDATE users SET totp_secret = ?, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?')
            ->execute([$this->box->encrypt($secret), $session['id']]);
        $this->audit->log('user.2fa_setup_started', $request, actorUserId: (int) $session['id'], targetType: 'user', targetId: (string) $session['id']);

        return new Response(200, ['secret' => $secret, 'uri' => Totp::uri($secret, (string) $session['email'])]);
    }

    /**
     * Schritt 2: mit dem ersten Code aus der App aktivieren.
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input
     */
    public function enable(array $session, array $input, Request $request): Response
    {
        if (self::enabled($session)) {
            throw new HttpError(409, 'already_enabled');
        }
        if (($session['totp_secret'] ?? null) === null) {
            throw new HttpError(409, 'setup_required');
        }
        $step = Totp::verify($this->box->decrypt((string) $session['totp_secret']), (string) ($input['code'] ?? ''), $this->clock->now());
        if ($step === null) {
            throw new HttpError(403, 'wrong_code');
        }

        $userId = (int) $session['id'];
        $this->pdo->prepare('UPDATE users SET totp_enabled_at = ?, totp_last_step = ? WHERE id = ?')->execute([$this->clock->datetime(), $step, $userId]);
        $codes = $this->newRecoveryCodes($userId);
        $this->sessions->revokeAll($userId, (int) $session['session_id']);
        $this->audit->log('user.2fa_enabled', $request, actorUserId: $userId, targetType: 'user', targetId: (string) $userId);
        $this->notify($session, 'Zwei-Faktor-Anmeldung eingeschaltet', 'die Zwei-Faktor-Anmeldung für dein Konto wurde eingeschaltet. Andere Geräte wurden abgemeldet.');

        return new Response(200, ['recovery_codes' => $codes]);
    }

    /**
     * Ausschalten – nur mit Passwort und gültigem Code.
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input
     */
    public function disable(array $session, array $input, Request $request): Response
    {
        $this->reauth->assertPassword($session, (string) ($input['password'] ?? ''));
        if (!self::enabled($session)) {
            throw new HttpError(409, 'not_enabled');
        }
        if (!$this->verify($session, (string) ($input['code'] ?? ''))) {
            throw new HttpError(403, 'wrong_code');
        }

        $userId = (int) $session['id'];
        $this->pdo->prepare('UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?')->execute([$userId]);
        $this->pdo->prepare('DELETE FROM recovery_codes WHERE user_id = ?')->execute([$userId]);
        $this->audit->log('user.2fa_disabled', $request, actorUserId: $userId, targetType: 'user', targetId: (string) $userId);
        $this->notify($session, 'Zwei-Faktor-Anmeldung ausgeschaltet', 'die Zwei-Faktor-Anmeldung für dein Konto wurde ausgeschaltet.');

        return new Response(200, ['status' => 'disabled']);
    }

    /**
     * Neue Wiederherstellungscodes; die alten werden ungültig.
     * @param array<string, mixed> $session
     * @param array<string, mixed> $input
     */
    public function regenerateRecoveryCodes(array $session, array $input, Request $request): Response
    {
        $this->reauth->assertPassword($session, (string) ($input['password'] ?? ''));
        if (!self::enabled($session)) {
            throw new HttpError(409, 'not_enabled');
        }
        $codes = $this->newRecoveryCodes((int) $session['id']);
        $this->audit->log('user.2fa_recovery_regenerated', $request, actorUserId: (int) $session['id'], targetType: 'user', targetId: (string) $session['id']);
        return new Response(200, ['recovery_codes' => $codes]);
    }

    /** @param array<string, mixed> $user */
    public function remainingRecoveryCodes(array $user): int
    {
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM recovery_codes WHERE user_id = ? AND used_at IS NULL');
        $statement->execute([$user['id']]);
        return (int) $statement->fetchColumn();
    }

    /**
     * Prüft einen Code aus der App (jeder nur einmal) oder einen Wiederherstellungscode (verbraucht ihn).
     * @param array<string, mixed> $user mit totp_secret und totp_last_step
     */
    public function verify(array $user, string $code): bool
    {
        $code = trim($code);
        // Genau 6 Ziffern = Code aus der App, alles andere = Wiederherstellungscode.
        if (preg_match('/^\d{' . Totp::DIGITS . '}$/', (string) preg_replace('/\s+/', '', $code))) {
            $step = Totp::verify($this->box->decrypt((string) $user['totp_secret']), $code, $this->clock->now());
            if ($step === null || ($user['totp_last_step'] !== null && $step <= (int) $user['totp_last_step'])) {
                return false;
            }
            $this->pdo->prepare('UPDATE users SET totp_last_step = ? WHERE id = ?')->execute([$step, $user['id']]);
            return true;
        }

        $statement = $this->pdo->prepare('UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL');
        $statement->execute([$this->clock->datetime(), $user['id'], $this->hashRecoveryCode($code)]);
        return $statement->rowCount() === 1;
    }

    /** @return list<string> */
    private function newRecoveryCodes(int $userId): array
    {
        $this->pdo->prepare('DELETE FROM recovery_codes WHERE user_id = ?')->execute([$userId]);
        $insert = $this->pdo->prepare('INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)');
        $codes = [];
        for ($i = 0; $i < self::RECOVERY_CODES; $i++) {
            $raw = strtolower(Totp::base32Encode(random_bytes(7)));
            $code = substr($raw, 0, 5) . '-' . substr($raw, 5, 5);
            $insert->execute([$userId, $this->hashRecoveryCode($code), $this->clock->datetime()]);
            $codes[] = $code;
        }
        return $codes;
    }

    private function hashRecoveryCode(string $code): string
    {
        $normalized = (string) preg_replace('/[^a-z2-7]/', '', strtolower($code));
        return hash_hmac('sha256', $normalized, $this->appSecret . ':recovery');
    }

    /** @param array<string, mixed> $session */
    private function notify(array $session, string $subject, string $sentence): void
    {
        $this->mailer->send(
            (string) $session['email'],
            "$subject – Bens Games",
            "Hallo {$session['display_name']},\n\n$sentence\n\nWarst du das nicht? Ändere sofort dein Passwort und melde dich bei uns.\n\nBens Games"
        );
    }
}
