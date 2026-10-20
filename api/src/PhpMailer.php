<?php

declare(strict_types=1);

namespace BensGames;

use RuntimeException;

/**
 * Versand über die PHP-Funktion mail() und damit über den Mailserver von ALL-INKL –
 * ohne zusätzliche Zugangsdaten. Absender ist ein eigenes Postfach (z. B. noreply@bens-games.de),
 * damit Rückläufer ankommen und die Mails nicht als gefälscht gelten.
 */
final class PhpMailer implements Mailer
{
    public function __construct(private string $from, private string $fromName)
    {
        if (!filter_var($from, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('Ungültige Absenderadresse.');
        }
    }

    public function send(string $to, string $subject, string $text): void
    {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $to . $subject)) {
            throw new RuntimeException('Ungültige Empfängeradresse oder Betreff.');
        }

        $headers = [
            'From' => mb_encode_mimeheader($this->fromName, 'UTF-8') . " <{$this->from}>",
            'MIME-Version' => '1.0',
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Content-Transfer-Encoding' => '8bit',
            'Auto-Submitted' => 'auto-generated',
        ];

        if (!mail($to, mb_encode_mimeheader($subject, 'UTF-8'), $text, $headers, '-f' . $this->from)) {
            throw new RuntimeException('E-Mail konnte nicht versendet werden.');
        }
    }
}
