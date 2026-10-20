-- Phase 4a: Spielstände und Erfolge im Konto.
-- Der Spielstand ist für die Plattform ein undurchsichtiger Text (JSON des Spiels) mit dem Zeitstempel des Spiels;
-- der neuere Stand gewinnt. Erfolge speichert die Plattform zusätzlich einzeln (für Profil, Statistik, Zentrale).

CREATE TABLE IF NOT EXISTS game_saves (
  user_id BIGINT UNSIGNED NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  data MEDIUMTEXT NOT NULL,
  client_time BIGINT NOT NULL,
  size INT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, app_id),
  CONSTRAINT fk_game_saves_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_game_saves_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_achievements (
  user_id BIGINT UNSIGNED NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  achievement_id VARCHAR(64) NOT NULL,
  unlocked_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, app_id, achievement_id),
  INDEX idx_game_achievements_app (app_id, achievement_id),
  CONSTRAINT fk_game_achievements_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_game_achievements_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
