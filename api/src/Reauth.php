<?php

declare(strict_types=1);

namespace BensGames;

/** Erneute Passwortabfrage für heikle Aktionen, mit Bremse gegen Durchprobieren. */
final class Reauth
{
    public function __construct(private RateLimiter $limiter)
    {
    }

    /** @param array<string, mixed> $session */
    public function assertPassword(array $session, string $password): void
    {
        if (!$this->limiter->hit('password:user', (string) $session['id'], 10, 900)) {
            throw new HttpError(429, 'too_many_attempts');
        }
        if (!password_verify($password, (string) $session['password_hash'])) {
            throw new HttpError(403, 'wrong_password');
        }
    }
}
