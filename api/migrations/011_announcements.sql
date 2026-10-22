-- Ankündigungen aus der Zentrale (Phase 6): Hinweise auf der Webseite und in den Spielen.
-- Zielgruppe: alle, nur Angemeldete oder Spieler eines bestimmten Spiels. Nur reiner Text, optional ein Link.

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(80) NOT NULL,
  body VARCHAR(500) NOT NULL,
  link VARCHAR(255) NULL,
  level VARCHAR(16) NOT NULL DEFAULT 'info',
  audience VARCHAR(16) NOT NULL DEFAULT 'all',
  app_id VARCHAR(64) NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_announcements_active (starts_at, ends_at),
  CONSTRAINT fk_announcements_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
