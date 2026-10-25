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
# Was hochgeladen wird: dist/ (Webseite) oder dist-admin/ (Zentrale)
LOCAL_DIR="${LOCAL_DIR:-dist/}"

SETTINGS="
  set ftp:ssl-force true;
  set ftp:ssl-protect-data true;
  set ftp:ssl-protect-list true;
  set ssl:verify-certificate true;
  set ftp:passive-mode true;
  set net:timeout 30;
  set net:max-retries 3;"

lftp --env-password -u "$FTP_USERNAME" "$FTP_SERVER" -e "$SETTINGS
  mirror --reverse --delete --verbose --exclude '^\.[^/]*$' $LOCAL_DIR ./;
  bye
"

# Optional: Sicherheits-Kopfzeilen als markierten Block in die .htaccess des Wurzelordners einfügen
# (HTACCESS_BLOCK = Pfad zur Block-Datei, z. B. deploy/htaccess-site.conf). Der Rest der Datei – vor allem
# der KAS-Verzeichnisschutz – bleibt erhalten. Lässt sich eine vorhandene Datei nicht lesen, wird abgebrochen
# statt überschrieben.
if [ -n "${HTACCESS_BLOCK:-}" ]; then
  TMP="$(mktemp -d)"
  # Erst nachsehen, ob es schon eine .htaccess gibt (Staging: ja, wegen Verzeichnisschutz; Live: anfangs nein).
  # Ob lftp etwas geschafft hat, zeigen die Merker-Dateien – so ist eine fehlende .htaccess kein Abbruch.
  lftp --env-password -u "$FTP_USERNAME" "$FTP_SERVER" -e "$SETTINGS
    cls -a -1 > $TMP/list && !touch $TMP/listed;
    bye
  " || true
  if [ ! -f "$TMP/listed" ]; then
    echo "::error::Der Wurzelordner konnte nicht gelistet werden – .htaccess wird nicht verändert."
    exit 1
  fi
  if grep -qx '.htaccess' "$TMP/list"; then
    lftp --env-password -u "$FTP_USERNAME" "$FTP_SERVER" -e "$SETTINGS
      get .htaccess -o $TMP/old.htaccess && !touch $TMP/got;
      bye
    " || true
    if [ ! -f "$TMP/got" ]; then
      echo "::error::Die vorhandene .htaccess konnte nicht gelesen werden – sie wird nicht verändert."
      exit 1
    fi
  else
    echo "Noch keine .htaccess im Wurzelordner – sie wird neu angelegt."
    : > "$TMP/old.htaccess"
  fi
  node scripts/merge-htaccess.mjs "$TMP/old.htaccess" "$HTACCESS_BLOCK" > "$TMP/new.htaccess"
  lftp --env-password -u "$FTP_USERNAME" "$FTP_SERVER" -e "$SETTINGS
    put $TMP/new.htaccess -o .htaccess;
    bye
  "
  echo "Sicherheits-Kopfzeilen in .htaccess eingetragen ($HTACCESS_BLOCK)."
fi
