<?php

declare(strict_types=1);

namespace BensGames;

use Closure;

/** Zeitquelle (UTC). In Tests lässt sich die Zeit vorspulen. */
final class Clock
{
    /** @param (Closure(): int)|null $now */
    public function __construct(private ?Closure $now = null)
    {
    }

    public function now(): int
    {
        return $this->now === null ? time() : ($this->now)();
    }

    public function datetime(int $offsetSeconds = 0): string
    {
        return gmdate('Y-m-d H:i:s', $this->now() + $offsetSeconds);
    }
}
