<?php

declare(strict_types=1);

namespace BensGames;

/**
 * Regeln für Anzeigenamen: 3 bis 24 Zeichen, eindeutig (ohne Groß-/Kleinschreibung und Akzente,
 * das erledigt die Datenbank) und keine reservierten Namen, mit denen man sich als Ben oder
 * Teil des Teams ausgeben könnte. Reservierte Namen vergibt nur Ben direkt in der Datenbank.
 */
final class Names
{
    /** Exakt reserviert (nach dem Vereinfachen, siehe squash()). */
    private const RESERVED = [
        'ben', 'bens', 'bensgames', 'bengames', 'benbucher', 'bonelessangel',
        'admin', 'administrator', 'moderator', 'mod', 'support', 'team', 'staff',
        'system', 'root', 'owner', 'besitzer', 'official', 'offiziell', 'novabastion',
    ];

    /** Namen, die so anfangen, sind ebenfalls reserviert (z. B. „Admin2“, „Moderator Max“). */
    private const RESERVED_PREFIXES = ['admin', 'moderator', 'bensgames', 'support', 'official', 'offiziell'];

    public static function formatError(string $name): ?string
    {
        if (!preg_match('/^[\p{L}\p{N}][\p{L}\p{N} _.\-]{1,22}[\p{L}\p{N}]$/u', $name)) {
            return 'Der Name braucht 3 bis 24 Zeichen: Buchstaben, Ziffern, Leerzeichen, Punkt, Binde- oder Unterstrich.';
        }
        if (self::isReserved($name)) {
            return 'Dieser Name ist reserviert. Bitte wähle einen anderen.';
        }
        return null;
    }

    public static function isReserved(string $name): bool
    {
        $squashed = self::squash($name);
        if (in_array($squashed, self::RESERVED, true)) {
            return true;
        }
        foreach (self::RESERVED_PREFIXES as $prefix) {
            if (str_starts_with($squashed, $prefix)) {
                return true;
            }
        }
        return false;
    }

    /** Kleinbuchstaben ohne Akzente, Leer- und Satzzeichen; typische Ersatzziffern werden zu Buchstaben. */
    private static function squash(string $name): string
    {
        $ascii = mb_strtolower($name);
        $ascii = strtr($ascii, ['ä' => 'a', 'ö' => 'o', 'ü' => 'u', 'ß' => 'ss', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'á' => 'a', 'à' => 'a', 'í' => 'i', 'ó' => 'o', 'ú' => 'u']);
        $ascii = strtr($ascii, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a']);
        return (string) preg_replace('/[^a-z]/', '', $ascii);
    }
}
