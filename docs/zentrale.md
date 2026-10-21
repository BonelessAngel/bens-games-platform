# Zentrale – Einrichtung und Betrieb

Die Zentrale läuft unter `admin.bens-games.de` (Test: `admin-staging.bens-games.de`). Sie nutzt dieselbe
Datenbank und denselben Code wie die Webseite, aber eine eigene `config.php` mit `role = admin`:

- Die Admin-Funktionen (`/api/admin/...`) gibt es **nur** dort; auf `bens-games.de` existieren sie nicht.
- Anmeldungen sind getrennt (`sessions.scope`): eine Anmeldung auf der Webseite gilt nicht in der Zentrale.
- Zugang nur mit Rechten für die Zentrale **und** eingeschalteter Zwei-Faktor-Anmeldung, Sitzung max. 8 Stunden.
- Zusätzlich schützt der KAS-Verzeichnisschutz den ganzen Ordner.

## Ordner auf dem Webspace

| Zweck | Webspace-Ordner | Konfiguration |
|---|---|---|
| Test-Zentrale `admin-staging.bens-games.de` | `/bens-games-staging-admin/` | `/bens-games-staging-admin-config/config.php` |
| Zentrale `admin.bens-games.de` | `/bens-games-admin/` | `/bens-games-admin-config/config.php` |

Die `config.php` der Zentrale enthält keine Zugangsdaten. Sie wird mit
`scripts/zentrale-config-erstellen.ps1 [production]` erzeugt und lädt die `config.php` der Webseite.

## GitHub Secrets

| Secret | Wo | Inhalt |
|---|---|---|
| `STAGING_ADMIN_FTP_USERNAME`, `STAGING_ADMIN_FTP_PASSWORD` | Repository-Secrets | FTP-Benutzer nur für `/bens-games-staging-admin/` |
| `PRODUCTION_ADMIN_FTP_USERNAME`, `PRODUCTION_ADMIN_FTP_PASSWORD` | Environment `production` | FTP-Benutzer nur für `/bens-games-admin/` |

Der Server (`STAGING_FTP_SERVER` / `PRODUCTION_FTP_SERVER`) ist derselbe wie für die Webseite.

## Besitzer festlegen (einmalig, nur in der Datenbank)

Die Rolle `owner` (alle Rechte inkl. Rechte vergeben) kann nie über die Zentrale vergeben werden.
Einmalig in phpMyAdmin der jeweiligen Datenbank (Reiter „SQL“), mit der eigenen E-Mail-Adresse:

```sql
INSERT INTO user_roles (user_id, role, granted_at)
SELECT id, 'owner', UTC_TIMESTAMP() FROM users WHERE email_normalized = LOWER('deine@adresse.de');
```

Optional den reservierten Namen „Ben“ setzen:

```sql
UPDATE users SET display_name = 'Ben' WHERE email_normalized = LOWER('deine@adresse.de');
```

Danach in der Zentrale anmelden (vorher auf der Webseite unter „Mein Konto“ die Zwei-Faktor-Anmeldung einschalten).

## Rechte

Rollen sind Pakete aus Rechten (`api/src/Permissions.php`): Tester, Moderator, Entwickler, Admin, Besitzer.
Einzelrechte: `stats.view`, `users.view`, `users.view_email`, `users.manage`, `moderation`, `audit.view`,
sowie pro App `app.<id>.beta` und `app.<id>.manage`. `roles.manage` hat nur der Besitzer.
Niemand kann eigene Rechte ändern, und das Konto des Besitzers ist in der Zentrale nicht änderbar.
