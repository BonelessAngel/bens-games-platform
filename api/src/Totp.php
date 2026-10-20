<?php

declare(strict_types=1);

namespace BensGames;

use InvalidArgumentException;

/**
 * Einmalcodes nach RFC 6238 (TOTP) – kompatibel mit gängigen Authenticator-Apps:
 * HMAC-SHA1, 6 Ziffern, 30 Sekunden. Akzeptiert wird der aktuelle Zeitschritt und je einer davor und danach.
 */
final class Totp
{
    public const DIGITS = 6;
    public const PERIOD = 30;
    private const WINDOW = 1;
    private const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /** Neuer Schlüssel (160 Bit) in Base32, so wie Authenticator-Apps ihn erwarten. */
    public static function generateSecret(): string
    {
        return self::base32Encode(random_bytes(20));
    }

    public static function code(string $base32Secret, int $step): string
    {
        $hash = hash_hmac('sha1', pack('J', $step), self::base32Decode($base32Secret), true);
        $offset = ord($hash[19]) & 0x0f;
        $value = ((ord($hash[$offset]) & 0x7f) << 24)
            | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8)
            | ord($hash[$offset + 3]);
        return str_pad((string) ($value % 10 ** self::DIGITS), self::DIGITS, '0', STR_PAD_LEFT);
    }

    /** @return int|null Zeitschritt des passenden Codes oder null */
    public static function verify(string $base32Secret, string $code, int $time): ?int
    {
        $code = preg_replace('/\s+/', '', $code) ?? '';
        if (!preg_match('/^\d{' . self::DIGITS . '}$/', $code)) {
            return null;
        }
        $current = intdiv($time, self::PERIOD);
        for ($step = $current - self::WINDOW; $step <= $current + self::WINDOW; $step++) {
            if (hash_equals(self::code($base32Secret, $step), $code)) {
                return $step;
            }
        }
        return null;
    }

    public static function uri(string $base32Secret, string $account, string $issuer = 'Bens Games'): string
    {
        return 'otpauth://totp/' . rawurlencode($issuer) . ':' . rawurlencode($account)
            . '?secret=' . $base32Secret . '&issuer=' . rawurlencode($issuer)
            . '&algorithm=SHA1&digits=' . self::DIGITS . '&period=' . self::PERIOD;
    }

    public static function base32Encode(string $bytes): string
    {
        $bits = '';
        foreach (str_split($bytes) as $char) {
            $bits .= str_pad(decbin(ord($char)), 8, '0', STR_PAD_LEFT);
        }
        $output = '';
        foreach (str_split($bits, 5) as $chunk) {
            $output .= self::BASE32[bindec(str_pad($chunk, 5, '0'))];
        }
        return $output;
    }

    public static function base32Decode(string $base32): string
    {
        $base32 = strtoupper(rtrim(preg_replace('/\s+/', '', $base32) ?? '', '='));
        $bits = '';
        foreach (str_split($base32) as $char) {
            $index = strpos(self::BASE32, $char);
            if ($index === false) {
                throw new InvalidArgumentException('Ungültiger Base32-Schlüssel.');
            }
            $bits .= str_pad(decbin($index), 5, '0', STR_PAD_LEFT);
        }
        $output = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $output .= chr(bindec($byte));
            }
        }
        return $output;
    }
}
