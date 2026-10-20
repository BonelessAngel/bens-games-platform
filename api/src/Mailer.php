<?php

declare(strict_types=1);

namespace BensGames;

interface Mailer
{
    public function send(string $to, string $subject, string $text): void;
}
