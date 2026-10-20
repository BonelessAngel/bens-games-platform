-- Phase 3.5: App-Verzeichnis in der Datenbank (PLATTFORM-PLAN.md, Abschnitt 5).
-- Name, Beschreibung, Symbol, Pfad und Version kommen aus src/data/apps.json im Repo und werden
-- bei jedem Deploy abgeglichen. Status und Sichtbarkeit werden nur beim ersten Anlegen übernommen
-- und danach in der Datenbank (später in der Zentrale) gepflegt.

CREATE TABLE IF NOT EXISTS apps (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(16) NOT NULL,
  description VARCHAR(500) NOT NULL,
  icon VARCHAR(255) NOT NULL,
  path VARCHAR(255) NOT NULL,
  version VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  visibility VARCHAR(16) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Freigaben einzelner Konten für Apps mit Sichtbarkeit „ausgewählte Nutzer“ oder Status „privat“.
-- Wird in Phase 5 durch das Recht app.<id>.beta ergänzt.
CREATE TABLE IF NOT EXISTS app_access (
  user_id BIGINT UNSIGNED NOT NULL,
  app_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, app_id),
  CONSTRAINT fk_app_access_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_app_access_app FOREIGN KEY (app_id) REFERENCES apps (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
