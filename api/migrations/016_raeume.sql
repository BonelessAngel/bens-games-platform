-- Räume für Mehrspieler-Partien (api/src/Rooms.php, docs/raeume-api.md).
-- rooms: ein Raum je Partie mit Code, Status und Startwert (seed).
-- room_players: Plätze im Raum. Gespeichert wird nur der Hash des Platz-Tokens; Gäste heißen „Gast 1234“,
--   Angemeldete werden über user_id mit Anzeigename und Profilbild gezeigt (nur den Mitspielern im Raum).
-- room_actions: geordnete Spielzüge (JSON, höchstens 4 KB).
-- Alles wird spätestens 24 Stunden nach dem Erstellen gelöscht (Lobby nach 30 Minuten, Partie nach 2 Stunden ohne Aktivität).

CREATE TABLE IF NOT EXISTS rooms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code CHAR(6) NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'waiting',
  mode VARCHAR(24) NOT NULL,
  visibility VARCHAR(8) NOT NULL,
  max_players TINYINT UNSIGNED NOT NULL,
  host_seat TINYINT UNSIGNED NOT NULL DEFAULT 0,
  seed INT UNSIGNED NULL,
  settings TEXT NOT NULL,
  action_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_rooms_code (code),
  INDEX idx_rooms_quick (app_id, visibility, status, mode),
  INDEX idx_rooms_updated (updated_at),
  INDEX idx_rooms_created (created_at),
  CONSTRAINT fk_rooms_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_players (
  room_id BIGINT UNSIGNED NOT NULL,
  seat TINYINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  guest_name VARCHAR(16) NULL,
  ready TINYINT(1) NOT NULL DEFAULT 0,
  left_at DATETIME NULL,
  last_seen DATETIME NOT NULL,
  place TINYINT UNSIGNED NULL,
  score INT UNSIGNED NULL,
  PRIMARY KEY (room_id, seat),
  UNIQUE KEY uq_room_players_token (token_hash),
  INDEX idx_room_players_user (user_id),
  CONSTRAINT fk_room_players_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_room_players_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS room_actions (
  room_id BIGINT UNSIGNED NOT NULL,
  seq INT UNSIGNED NOT NULL,
  seat TINYINT UNSIGNED NOT NULL,
  data TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (room_id, seq),
  CONSTRAINT fk_room_actions_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
