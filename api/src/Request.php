<?php

declare(strict_types=1);

namespace BensGames;

final class Request
{
    /**
     * @param array<string, string> $headers Header-Namen in Kleinbuchstaben
     * @param array<string, string> $cookies
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $headers = [],
        public readonly string $body = '',
        public readonly array $cookies = [],
        public readonly string $ip = '',
    ) {
    }

    public static function fromGlobals(): self
    {
        $path = (string) (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
        $headers = function_exists('getallheaders') ? (getallheaders() ?: []) : [];

        return new self(
            method: (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            path: trim((string) preg_replace('#^/api(?:/|$)#', '', $path), '/'),
            headers: array_change_key_case($headers, CASE_LOWER),
            body: (string) file_get_contents('php://input', length: 65536),
            cookies: array_map('strval', $_COOKIE),
            ip: (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        );
    }

    public function header(string $name): string
    {
        return (string) ($this->headers[strtolower($name)] ?? '');
    }

    /** @return array<string, mixed> */
    public function json(): array
    {
        if (trim($this->body) === '') {
            return [];
        }
        $data = json_decode($this->body, true);
        if (!is_array($data)) {
            throw new HttpError(400, 'invalid_json');
        }
        return $data;
    }
}
