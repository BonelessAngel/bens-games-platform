-- Phase 5b: Spielstatistik. Spiele schicken kleine Ereignisse (Start, „noch aktiv“, Level begonnen/beendet).
-- Gäste: anonym (user_id NULL). Angemeldete: dem Konto zugeordnet, außer sie haben widersprochen
-- (users.stats_opt_out). Keine IP-Adressen, keine Cookies; „visit“ ist eine zufällige Kennung pro Seitenaufruf.
-- Rohdaten werden nach 90 Tagen gelöscht (api/src/Cleanup.php). Beim Löschen eines Kontos bleibt die
-- Statistik anonym erhalten (ON DELETE SET NULL).

ALTER TABLE users ADD COLUMN stats_opt_out TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

CREATE TABLE IF NOT EXISTS game_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  visit CHAR(32) NOT NULL,
  type VARCHAR(16) NOT NULL,
  level VARCHAR(32) NULL,
  result VARCHAR(8) NULL,
  score BIGINT NULL,
  stars TINYINT UNSIGNED NULL,
  seconds INT UNSIGNED NULL,
  data TEXT NULL,
  INDEX idx_game_events_app_time (app_id, created_at),
  INDEX idx_game_events_level (app_id, level, type),
  INDEX idx_game_events_user (user_id, app_id),
  INDEX idx_game_events_created (created_at),
  CONSTRAINT fk_game_events_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
  CONSTRAINT fk_game_events_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
