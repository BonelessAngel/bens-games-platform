#!/usr/bin/env bash
# Lädt dist/ per FTPS hoch. Wird von den Deploy-Workflows aufgerufen.
# Erwartet FTP_SERVER, FTP_USERNAME und LFTP_PASSWORD als Umgebungsvariablen (aus GitHub Secrets).
#
# Der FTP-Benutzer ist im KAS auf seinen Zielordner beschränkt, sein Wurzelordner ist also das Ziel.
# Versteckte Dateien direkt im Wurzelordner (.htaccess/.htpasswd vom KAS-Verzeichnisschutz) werden
# weder hochgeladen noch gelöscht. Versteckte Dateien in Unterordnern (z. B. games/*/.htaccess) gehören
# zur Plattform und werden normal übertragen.
set -euo pipefail

: "${FTP_SERVER:?FTP_SERVER fehlt}"
: "${FTP_USERNAME:?FTP_USERNAME fehlt}"
: "${LFTP_PASSWORD:?LFTP_PASSWORD fehlt}"

lftp --env-password -u "$FTP_USERNAME" "$FTP_SERVER" -e "
  set ftp:ssl-force true;
  set ftp:ssl-protect-data true;
  set ftp:ssl-protect-list true;
  set ssl:verify-certificate true;
  set ftp:passive-mode true;
  set net:timeout 30;
  set net:max-retries 3;
  mirror --reverse --delete --verbose --exclude '^\.[^/]*$' dist/ ./;
  bye
"
