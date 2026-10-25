-- Ausbau der Zentrale: Fehlermeldungen aus den Spielen und ein kurzer Verlauf der Spielstände (Spielstand-Hilfe).
-- Fehlermeldungen enthalten weder Konto noch IP-Adresse; sie werden nach 90 Tagen gelöscht (api/src/Cleanup.php).
-- Der Spielstand-Verlauf hält höchstens 10 ältere Stände je Konto und Spiel, jeweils höchstens 30 Tage lang.

CREATE TABLE IF NOT EXISTS client_errors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  version VARCHAR(32) NULL,
  fingerprint CHAR(40) NOT NULL,
  message VARCHAR(300) NOT NULL,
  source VARCHAR(200) NULL,
  stack VARCHAR(2000) NULL,
  browser VARCHAR(40) NULL,
  INDEX idx_client_errors_group (app_id, fingerprint, created_at),
  INDEX idx_client_errors_created (created_at),
  CONSTRAINT fk_client_errors_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_errors_resolved (
  app_id VARCHAR(64) NOT NULL,
  fingerprint CHAR(40) NOT NULL,
  resolved_at DATETIME NOT NULL,
  resolved_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (app_id, fingerprint),
  CONSTRAINT fk_client_errors_resolved_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_save_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  data MEDIUMTEXT NOT NULL,
  client_time BIGINT NOT NULL,
  size INT UNSIGNED NOT NULL,
  saved_at DATETIME NOT NULL,
  reason VARCHAR(16) NOT NULL DEFAULT 'update',
  INDEX idx_game_save_history_user (user_id, app_id, saved_at),
  INDEX idx_game_save_history_saved (saved_at),
  CONSTRAINT fk_game_save_history_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_game_save_history_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
