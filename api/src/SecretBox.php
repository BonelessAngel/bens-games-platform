<?php

declare(strict_types=1);

namespace BensGames;

use RuntimeException;

/**
 * Verschlüsselt kleine Geheimnisse (z. B. TOTP-Schlüssel) mit AES-256-GCM.
 * Der Schlüssel wird aus app_secret abgeleitet und liegt nur in der Server-config.php –
 * wer nur die Datenbank hat, kann die Werte nicht lesen.
 */
final class SecretBox
{
    private const VERSION = 'v1';
    private string $key;

    public function __construct(string $appSecret, string $purpose)
    {
        $this->key = hash_hmac('sha256', $purpose, $appSecret, true);
    }

    public function encrypt(string $plaintext): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag);
        if ($ciphertext === false) {
            throw new RuntimeException('Verschlüsselung fehlgeschlagen.');
        }
        return self::VERSION . ':' . base64_encode($iv . $tag . $ciphertext);
    }

    public function decrypt(string $stored): string
    {
        [$version, $payload] = array_pad(explode(':', $stored, 2), 2, '');
        $raw = base64_decode($payload, true);
        if ($version !== self::VERSION || $raw === false || strlen($raw) < 28) {
            throw new RuntimeException('Ungültiger verschlüsselter Wert.');
        }
        $plaintext = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        if ($plaintext === false) {
            throw new RuntimeException('Entschlüsselung fehlgeschlagen.');
        }
        return $plaintext;
    }
}
