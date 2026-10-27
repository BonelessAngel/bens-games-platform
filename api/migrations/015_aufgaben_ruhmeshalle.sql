-- Tägliche Aufgaben, Ruhmeshalle und Ticker (api/src/Activity.php).
-- daily_activity: je Konto, Tag und Spiel nur Zähler (Runden, Bestwert, Level, Tages-Challenge, Endlos, neue Erfolge) –
-- Grundlage der Tagesaufgaben, nach 40 Tagen gelöscht. Erledigte Aufgaben ebenso; dauerhaft bleibt nur die Summe am Konto.
-- hall_of_fame: Platz 1–3 jeder abgelaufenen Wochenrangliste, bleibt bis zur Löschung des Kontos.
-- feed_events: öffentlicher Ticker (Rekorde, Erfolge, neue Level, Wochensiege), nach 30 Tagen gelöscht.

CREATE TABLE IF NOT EXISTS daily_activity (
  user_id BIGINT UNSIGNED NOT NULL,
  day DATE NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  rounds INT UNSIGNED NOT NULL DEFAULT 0,
  best INT UNSIGNED NOT NULL DEFAULT 0,
  levels INT UNSIGNED NOT NULL DEFAULT 0,
  daily_challenge TINYINT(1) NOT NULL DEFAULT 0,
  endless INT UNSIGNED NOT NULL DEFAULT 0,
  achievements INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, app_id),
  INDEX idx_daily_activity_day (day),
  CONSTRAINT fk_daily_activity_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_daily_activity_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_tasks_done (
  user_id BIGINT UNSIGNED NOT NULL,
  day DATE NOT NULL,
  task VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, day, task),
  INDEX idx_daily_tasks_day (day),
  CONSTRAINT fk_daily_tasks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Summen für den Spieler-Rang (bleiben, auch wenn die Tageszeilen gelöscht sind)
ALTER TABLE users
  ADD COLUMN tasks_done INT UNSIGNED NOT NULL DEFAULT 0 AFTER profile_activity,
  ADD COLUMN task_days INT UNSIGNED NOT NULL DEFAULT 0 AFTER tasks_done;

CREATE TABLE IF NOT EXISTS hall_of_fame (
  week VARCHAR(8) NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  board VARCHAR(32) NOT NULL,
  place TINYINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  score INT UNSIGNED NOT NULL,
  PRIMARY KEY (week, app_id, board, place),
  INDEX idx_hall_user (user_id, place),
  CONSTRAINT fk_hall_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_hall_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hall_weeks_done (
  week VARCHAR(8) NOT NULL PRIMARY KEY,
  archived_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feed_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME NOT NULL,
  day DATE NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(16) NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  board VARCHAR(32) NOT NULL DEFAULT '',
  score INT UNSIGNED NULL,
  amount INT UNSIGNED NULL,
  title VARCHAR(100) NULL,
  UNIQUE KEY uniq_feed_day (user_id, kind, app_id, board, day),
  INDEX idx_feed_created (created_at),
  CONSTRAINT fk_feed_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_feed_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
