# Erstellt die config.php der Zentrale (admin.bens-games.de bzw. admin-staging.bens-games.de).
# Aufruf (im Ordner bens-games-platform):
#   powershell -ExecutionPolicy Bypass -File .\scripts\zentrale-config-erstellen.ps1            (Test-Zentrale)
#   powershell -ExecutionPolicy Bypass -File .\scripts\zentrale-config-erstellen.ps1 production (Zentrale)
#
# Die Datei enthält KEINE Zugangsdaten: Sie lädt die vorhandene config.php der Webseite
# (dieselbe Datenbank, dieselben Schlüssel) und stellt nur die Rolle auf „admin“.
param([ValidateSet('staging', 'production')][string]$Umgebung = 'staging')
$ErrorActionPreference = 'Stop'

if ($Umgebung -eq 'staging') {
  $folder = 'bens-games-staging-admin-config'
  $siteConfig = 'bens-games-staging-config'
} else {
  $folder = 'bens-games-admin-config'
  $siteConfig = 'bens-games-live-config'
}

$php = @"
<?php
// Server-Konfiguration der Zentrale ($Umgebung). Gehört nach /$folder/config.php.
// Übernimmt Datenbank und Schlüssel aus /$siteConfig/config.php und schaltet nur die Rolle „admin“ ein.
`$config = require __DIR__ . '/../$siteConfig/config.php';
`$config['role'] = 'admin';
return `$config;
"@

$targetDir = Join-Path ([Environment]::GetFolderPath('Desktop')) $folder
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$target = Join-Path $targetDir 'config.php'
[IO.File]::WriteAllText($target, $php, (New-Object Text.UTF8Encoding $false))

Write-Host ''
Write-Host "Fertig: $target" -ForegroundColor Green
Write-Host "Per WebFTP in den Ordner /$folder/ hochladen (neben /$siteConfig/)."
