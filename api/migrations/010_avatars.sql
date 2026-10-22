-- Profilbilder: fertiges Motiv (avatar) und Hintergrundfarbe (avatar_color) aus lib/avatars.js – kein Upload.
-- Ohne Auswahl zeigt die Webseite den Anfangsbuchstaben des Namens.

ALTER TABLE users
  ADD COLUMN avatar VARCHAR(32) NULL AFTER display_name,
  ADD COLUMN avatar_color VARCHAR(16) NULL AFTER avatar;
