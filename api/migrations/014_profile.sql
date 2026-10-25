-- Spielerprofile gestalten: Banner, Titel, bis zu 3 angepinnte Abzeichen und der Aktivitäts-Kalender (nur mit Zustimmung).

ALTER TABLE users
  ADD COLUMN profile_banner VARCHAR(24) NULL AFTER avatar_color,
  ADD COLUMN profile_title VARCHAR(32) NULL AFTER profile_banner,
  ADD COLUMN profile_pins VARCHAR(400) NULL AFTER profile_title,
  ADD COLUMN profile_activity TINYINT(1) NOT NULL DEFAULT 0 AFTER profile_pins;
