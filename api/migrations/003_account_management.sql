-- Phase 3.3: eindeutige Namen und „Angemeldet bleiben“.

-- Bereits doppelte Namen (nur Testkonten auf Staging) bekommen die Konto-Nummer angehängt.
UPDATE users u
JOIN (SELECT MIN(id) AS keep_id, display_name FROM users GROUP BY display_name HAVING COUNT(*) > 1) d
  ON u.display_name = d.display_name AND u.id <> d.keep_id
SET u.display_name = CONCAT(LEFT(u.display_name, 20), '-', u.id);

-- Die Sortierung utf8mb4_unicode_ci vergleicht ohne Groß-/Kleinschreibung und ohne Akzente:
-- „Ben“, „ben“ und „Bén“ gelten als derselbe Name.
ALTER TABLE users ADD UNIQUE KEY uq_users_display_name (display_name);

ALTER TABLE sessions ADD COLUMN persistent TINYINT(1) NOT NULL DEFAULT 0 AFTER expires_at;
