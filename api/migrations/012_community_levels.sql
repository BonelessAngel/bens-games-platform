-- Community-Level (Phase 6): Spieler bauen Level, laden sie mit Konto hoch, alle können sie spielen.
-- Daumen hoch und Bestenliste je Level nur mit Konto. Mit dem Konto werden auch seine Level, Daumen und Ergebnisse gelöscht.
-- Dazu: vom Spiel-Team in der Zentrale veröffentlichte Inhalte (z. B. die Kampagne von Nova Bastion).

CREATE TABLE IF NOT EXISTS community_levels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  app_id VARCHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(40) NOT NULL,
  meta TEXT NOT NULL,
  level MEDIUMTEXT NOT NULL,
  plays INT UNSIGNED NOT NULL DEFAULT 0,
  wins INT UNSIGNED NOT NULL DEFAULT 0,
  likes INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  hidden_at DATETIME NULL,
  hidden_by BIGINT UNSIGNED NULL,
  hidden_reason VARCHAR(100) NULL,
  INDEX idx_community_levels_app (app_id, created_at),
  INDEX idx_community_levels_user (user_id, app_id),
  CONSTRAINT fk_community_levels_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
  CONSTRAINT fk_community_levels_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_likes (
  level_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (level_id, user_id),
  CONSTRAINT fk_community_likes_level FOREIGN KEY (level_id) REFERENCES community_levels (id) ON DELETE CASCADE,
  CONSTRAINT fk_community_likes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bestes Ergebnis je Konto und Level (für „Beste: Anna (12)“)
CREATE TABLE IF NOT EXISTS community_results (
  level_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  lives INT UNSIGNED NOT NULL,
  achieved_at DATETIME NOT NULL,
  PRIMARY KEY (level_id, user_id),
  CONSTRAINT fk_community_results_level FOREIGN KEY (level_id) REFERENCES community_levels (id) ON DELETE CASCADE,
  CONSTRAINT fk_community_results_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_content (
  app_id VARCHAR(64) NOT NULL,
  content_key VARCHAR(32) NOT NULL,
  json MEDIUMTEXT NOT NULL,
  ts BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (app_id, content_key),
  CONSTRAINT fk_app_content_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
