<?php

declare(strict_types=1);

namespace BensGames;

use RuntimeException;

/** Erwarteter Fehler mit HTTP-Status und maschinenlesbarem Code für das Frontend. */
final class HttpError extends RuntimeException
{
    /** @param array<string, mixed> $extra */
    public function __construct(public readonly int $status, public readonly string $error, public readonly array $extra = [])
    {
        parent::__construct($error);
    }
}
