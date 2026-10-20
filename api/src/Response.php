<?php

declare(strict_types=1);

namespace BensGames;

final class Response
{
    /** @var list<array{name: string, value: string, expires: int}> */
    public array $cookies = [];

    /** @param array<string, mixed> $body */
    public function __construct(public readonly int $status, public readonly array $body = [])
    {
    }

    /**
     * Cookies gelten immer nur für den eigenen Host (__Host-Präfix: Secure, Path=/, keine Domain).
     * @param int $expires 0 = bis der Browser geschlossen wird, negativ = löschen
     */
    public function withCookie(string $name, string $value, int $expires = 0): self
    {
        $this->cookies[] = ['name' => $name, 'value' => $value, 'expires' => $expires];
        return $this;
    }

    public function send(): void
    {
        http_response_code($this->status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        header('Referrer-Policy: no-referrer');
        foreach ($this->cookies as $cookie) {
            setcookie($cookie['name'], $cookie['value'], [
                'expires' => $cookie['expires'] < 0 ? 1 : $cookie['expires'],
                'path' => '/',
                'secure' => true,
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
        if ($this->status !== 204) {
            echo json_encode($this->body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        }
    }
}
