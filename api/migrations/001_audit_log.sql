-- Protokoll wichtiger Konto- und Admin-Aktionen (PLATTFORM-PLAN.md, Abschnitt 4 und 6).
-- Nie Passwörter oder vollständige IP-Adressen speichern; ip_prefix enthält nur die gekürzte Adresse.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NULL,
  target_id VARCHAR(64) NULL,
  ip_prefix VARCHAR(45) NULL,
  details TEXT NULL,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_actor (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
