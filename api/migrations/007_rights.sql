-- Phase 5a: Rechte für die Zentrale und getrennte Sitzungen für Webseite und Zentrale.
-- Rechte werden einzeln oder über Rollen (Pakete aus Rechten, definiert in api/src/Permissions.php) vergeben.
-- Die Rolle „owner“ (Besitzer, inkl. roles.manage) wird nie über die Zentrale vergeben, nur direkt in der Datenbank.

-- Sitzungen der Webseite (site) und der Zentrale (admin) sind getrennt: eine Anmeldung auf bens-games.de
-- gilt nie für admin.bens-games.de und umgekehrt.
ALTER TABLE sessions ADD COLUMN scope VARCHAR(16) NOT NULL DEFAULT 'site' AFTER user_id;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(32) NOT NULL,
  granted_at DATETIME NOT NULL,
  granted_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (user_id, role),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id BIGINT UNSIGNED NOT NULL,
  permission VARCHAR(96) NOT NULL,
  granted_at DATETIME NOT NULL,
  granted_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (user_id, permission),
  CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
