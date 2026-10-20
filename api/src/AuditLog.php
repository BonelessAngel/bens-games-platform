<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/** Protokoll wichtiger Aktionen – ohne Passwörter, E-Mail-Adressen oder vollständige IP-Adressen. */
final class AuditLog
{
    public function __construct(private PDO $pdo, private Clock $clock)
    {
    }

    /** @param array<string, scalar>|null $details */
    public function log(
        string $action,
        Request $request,
        ?int $actorUserId = null,
        ?string $targetType = null,
        ?string $targetId = null,
        ?array $details = null,
    ): void {
        $this->pdo->prepare(
            'INSERT INTO audit_log (created_at, actor_user_id, action, target_type, target_id, ip_prefix, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $this->clock->datetime(),
            $actorUserId,
            $action,
            $targetType,
            $targetId,
            Security::ipPrefix($request->ip),
            $details === null ? null : json_encode($details, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        ]);
    }
}
