<?php

declare(strict_types=1);

namespace BensGames;

use PDO;

/**
 * Rechte und Rollen (PLATTFORM-PLAN.md, Abschnitt 4). Rollen sind nur Pakete aus Rechten.
 * Öffentliche Registrierung erzeugt Konten ohne Rechte; niemand kann sich selbst Rechte geben.
 */
final class Permissions
{
    /** Feste Rechte mit Beschreibung für die Zentrale. */
    public const ALL = [
        'stats.view' => 'Statistiken ansehen',
        'users.view' => 'Kontenliste ansehen (ohne E-Mail-Adressen)',
        'users.view_email' => 'E-Mail-Adressen ansehen',
        'users.manage' => 'Konten sperren und Sitzungen beenden',
        'moderation' => 'Community-Inhalte, Namen und Meldungen moderieren',
        'audit.view' => 'Protokoll und Sicherheit ansehen',
        'announcements.manage' => 'Ankündigungen auf der Webseite und in den Spielen veröffentlichen',
        'roles.manage' => 'Rechte vergeben (nur Besitzer)',
    ];

    /** Rechte pro App, z. B. app.nova-bastion.beta */
    public const APP_PATTERN = '/^app\.[a-z0-9]+(?:-[a-z0-9]+)*\.(beta|manage)$/';

    public const ROLES = [
        'tester' => ['name' => 'Tester', 'permissions' => []],
        'moderator' => ['name' => 'Moderator', 'permissions' => ['users.view', 'moderation']],
        'developer' => ['name' => 'Entwickler', 'permissions' => ['stats.view', 'audit.view']],
        'admin' => ['name' => 'Admin', 'permissions' => ['stats.view', 'users.view', 'users.view_email', 'users.manage', 'moderation', 'audit.view', 'announcements.manage']],
        'owner' => ['name' => 'Besitzer', 'permissions' => ['*']],
    ];

    /** Mit mindestens einem dieser Rechte darf man die Zentrale betreten. */
    public const PANEL = ['stats.view', 'users.view', 'moderation', 'audit.view', 'announcements.manage', 'roles.manage'];

    /** Diese Rollen und Rechte werden nie über die Zentrale vergeben. */
    public const NOT_GRANTABLE_ROLES = ['owner'];
    public const NOT_GRANTABLE_PERMISSIONS = ['roles.manage'];

    public function __construct(private PDO $pdo)
    {
    }

    public static function isValidPermission(string $permission): bool
    {
        return isset(self::ALL[$permission]) || preg_match(self::APP_PATTERN, $permission) === 1;
    }

    /** @return list<string> */
    public function roles(int $userId): array
    {
        $statement = $this->pdo->prepare('SELECT role FROM user_roles WHERE user_id = ? ORDER BY role');
        $statement->execute([$userId]);
        return array_values(array_filter($statement->fetchAll(PDO::FETCH_COLUMN), static fn (string $r): bool => isset(self::ROLES[$r])));
    }

    /** @return list<string> einzeln vergebene Rechte */
    public function direct(int $userId): array
    {
        $statement = $this->pdo->prepare('SELECT permission FROM user_permissions WHERE user_id = ? ORDER BY permission');
        $statement->execute([$userId]);
        return array_values(array_filter($statement->fetchAll(PDO::FETCH_COLUMN), self::isValidPermission(...)));
    }

    /** @return list<string> alle wirksamen Rechte („*“ = Besitzer) */
    public function effective(int $userId): array
    {
        $all = $this->direct($userId);
        foreach ($this->roles($userId) as $role) {
            $all = array_merge($all, self::ROLES[$role]['permissions']);
        }
        $all = array_values(array_unique($all));
        sort($all);
        return $all;
    }

    public function has(int $userId, string $permission): bool
    {
        $effective = $this->effective($userId);
        return in_array('*', $effective, true) || in_array($permission, $effective, true);
    }

    public function canEnterPanel(int $userId): bool
    {
        foreach (self::PANEL as $permission) {
            if ($this->has($userId, $permission)) {
                return true;
            }
        }
        // Wer eine App verwalten darf, braucht ebenfalls Zugang zur Zentrale.
        foreach ($this->effective($userId) as $permission) {
            if (str_ends_with($permission, '.manage') && str_starts_with($permission, 'app.')) {
                return true;
            }
        }
        return false;
    }

    public function isOwner(int $userId): bool
    {
        return in_array('owner', $this->roles($userId), true);
    }
}
