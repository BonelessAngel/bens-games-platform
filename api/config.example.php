<?php
// VORLAGE – diese Datei enthält keine echten Zugangsdaten und wird nicht hochgeladen.
//
// So wird daraus die echte Konfiguration:
// 1. Kopie als config.php speichern (nur auf deinem PC, nie ins Repo).
// 2. Alle Werte mit HIER_ ersetzen.
// 3. Per WebFTP in den Ordner NEBEN der Webseite hochladen:
//      Staging:    /bens-games-staging-config/config.php
//      Produktion: /bens-games-live-config/config.php
//    (nicht in /bens-games-staging/ oder /bens-games-live/ selbst!)
// 4. Die lokale Kopie danach löschen oder sicher aufbewahren.

return [
    // 'staging' oder 'production'
    'environment' => 'staging',

    // Zugangsdaten der Datenbank aus dem KAS (Datenbanken → Bearbeiten)
    'db' => [
        'host' => 'localhost',
        'name' => 'HIER_DATENBANKNAME',
        'user' => 'HIER_DATENBANKBENUTZER',
        'password' => 'HIER_DATENBANKPASSWORT',
    ],

    // Zufallswerte, je mindestens 32 Zeichen. Sicher erzeugen in PowerShell (jedes Mal ein neuer Wert):
    //   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
    // migration_token muss zusätzlich als GitHub Secret STAGING_MIGRATION_TOKEN hinterlegt werden.
    'migration_token' => 'HIER_ZUFALLSWERT_1',
    // app_secret bleibt nur hier (für Signaturen und Verschlüsselung, z. B. der Zwei-Faktor-Schlüssel).
    'app_secret' => 'HIER_ZUFALLSWERT_2',
];
