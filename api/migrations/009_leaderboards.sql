-- Phase 4b: Ranglisten („diese Woche“ und „gesamt“) mit Moderation.
-- Pro Spiel, Rangliste (board, z. B. Level oder Modus) und Konto wird der Bestwert gespeichert:
-- einmal je Kalenderwoche (period = '2026-W43') und einmal für immer (period = 'all').
-- Öffentlich sichtbar sind nur Anzeigename, Punkte und Datum. Konten können sich aus Ranglisten
-- herausnehmen (users.leaderboard_opt_out); Moderatoren können Einträge ausblenden.

ALTER TABLE users ADD COLUMN leaderboard_opt_out TINYINT(1) NOT NULL DEFAULT 0 AFTER stats_opt_out;

CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  app_id VARCHAR(64) NOT NULL,
  board VARCHAR(32) NOT NULL,
  period VARCHAR(8) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  score BIGINT UNSIGNED NOT NULL,
  achieved_at DATETIME NOT NULL,
  hidden_at DATETIME NULL,
  hidden_by BIGINT UNSIGNED NULL,
  hidden_reason VARCHAR(100) NULL,
  UNIQUE KEY uq_leaderboard (app_id, board, period, user_id),
  INDEX idx_leaderboard_rank (app_id, board, period, score),
  CONSTRAINT fk_leaderboard_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE,
  CONSTRAINT fk_leaderboard_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
