<?php

declare(strict_types=1);

namespace BensGames;

/**
 * Erlaubte Profilbilder. Muss mit lib/avatars.js übereinstimmen (ein Test prüft das).
 */
final class Avatars
{
    public const AVATARS = [
        'crown', 'star', 'heart', 'bolt', 'rocket', 'castle', 'shield', 'gem', 'planet', 'moon', 'sun', 'flame',
        'ghost', 'cat', 'fox', 'owl', 'robot', 'alien', 'spade', 'diamond', 'club', 'dice', 'gamepad', 'note',
    ];

    public const COLORS = ['indigo', 'teal', 'rose', 'amber', 'violet', 'sky', 'emerald', 'slate'];

    /** @return array{avatar: ?string, avatar_color: ?string} */
    public static function validate(mixed $avatar, mixed $color): array
    {
        if ($avatar === null || $avatar === '') {
            return ['avatar' => null, 'avatar_color' => null];
        }
        if (!is_string($avatar) || !in_array($avatar, self::AVATARS, true) || !is_string($color) || !in_array($color, self::COLORS, true)) {
            throw new HttpError(422, 'validation', ['fields' => ['avatar' => 'Dieses Profilbild gibt es nicht.']]);
        }
        return ['avatar' => $avatar, 'avatar_color' => $color];
    }
}
