-- Phase 3.4: Zwei-Faktor-Anmeldung mit Authenticator-App (TOTP).
-- Der TOTP-Schlüssel wird verschlüsselt gespeichert (Schlüssel: app_secret aus der Server-config.php),
-- Wiederherstellungscodes nur als HMAC.

ALTER TABLE users
  ADD COLUMN totp_secret VARCHAR(255) NULL AFTER password_hash,
  ADD COLUMN totp_enabled_at DATETIME NULL AFTER totp_secret,
  ADD COLUMN totp_last_step BIGINT NULL AFTER totp_enabled_at;

CREATE TABLE IF NOT EXISTS recovery_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  UNIQUE KEY uq_recovery_codes_hash (code_hash),
  INDEX idx_recovery_codes_user (user_id),
  CONSTRAINT fk_recovery_codes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Zwischenschritt nach richtigem Passwort, bis der zweite Faktor eingegeben ist (5 Minuten gültig).
CREATE TABLE IF NOT EXISTS login_challenges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  remember TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  UNIQUE KEY uq_login_challenges_hash (token_hash),
  CONSTRAINT fk_login_challenges_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
