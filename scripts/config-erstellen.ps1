# Erstellt die Server-Konfiguration config.php für die Bens-Games-API.
# Aufruf (im Ordner bens-games-platform):
#   powershell -ExecutionPolicy Bypass -File .\scripts\config-erstellen.ps1            (Staging)
#   powershell -ExecutionPolicy Bypass -File .\scripts\config-erstellen.ps1 production (Produktion)
#
# Die Datei landet auf dem Desktop im passenden Ordner und wird von dort per WebFTP hochgeladen.
# Sie enthält Zugangsdaten: nie ins Repo, nie in einen Chat, nach dem Hochladen vom Desktop löschen.
param([ValidateSet('staging', 'production')][string]$Umgebung = 'staging')
$ErrorActionPreference = 'Stop'

function New-Secret {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $_.ToString('x2') })
}
function ConvertTo-PhpString([string]$value) {
  "'" + $value.Replace('\', '\\').Replace("'", "\'") + "'"
}

$folder = if ($Umgebung -eq 'staging') { 'bens-games-staging-config' } else { 'bens-games-live-config' }
$secretName = if ($Umgebung -eq 'staging') { 'STAGING_MIGRATION_TOKEN' } else { 'PRODUCTION_MIGRATION_TOKEN' }

Write-Host ''
Write-Host "Server-Konfiguration für: $Umgebung" -ForegroundColor Cyan
Write-Host 'Die Angaben findest du im KAS unter "Datenbanken".'
$dbName = Read-Host 'Datenbankname (z. B. d0123456)'
$dbUser = Read-Host 'Datenbankbenutzer (meist gleich wie der Name)'
$secure = Read-Host 'Datenbankpasswort' -AsSecureString
$dbPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $dbName -or -not $dbUser -or -not $dbPassword) { throw 'Name, Benutzer und Passwort müssen ausgefüllt sein.' }

$migrationToken = New-Secret
$maintenanceToken = New-Secret
$appSecret = New-Secret
$maintenanceSecretName = if ($Umgebung -eq 'staging') { $null } else { 'PRODUCTION_MAINTENANCE_TOKEN' }

$php = @"
<?php
// Server-Konfiguration der Bens-Games-API ($Umgebung), erstellt am $(Get-Date -Format 'dd.MM.yyyy HH:mm').
// Gehört nach /$folder/config.php – NICHT in den Webseiten-Ordner, nie ins Repo.
return [
    'environment' => $(ConvertTo-PhpString $Umgebung),
    'db' => [
        'host' => 'localhost',
        'name' => $(ConvertTo-PhpString $dbName),
        'user' => $(ConvertTo-PhpString $dbUser),
        'password' => $(ConvertTo-PhpString $dbPassword),
    ],
    'migration_token' => $(ConvertTo-PhpString $migrationToken),
    'maintenance_token' => $(ConvertTo-PhpString $maintenanceToken),
    'app_secret' => $(ConvertTo-PhpString $appSecret),
];
"@

$targetDir = Join-Path ([Environment]::GetFolderPath('Desktop')) $folder
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$target = Join-Path $targetDir 'config.php'
[IO.File]::WriteAllText($target, $php, (New-Object Text.UTF8Encoding $false))

Write-Host ''
Write-Host "Fertig: $target" -ForegroundColor Green
Write-Host ''
Set-Clipboard -Value $migrationToken
Write-Host "1) Der Wert für das GitHub Secret $secretName ist jetzt in der Zwischenablage." -ForegroundColor Yellow
if ($Umgebung -eq 'production') {
  Write-Host '   Anlegen unter Settings → Environments → production → Environment secrets.'
} else {
  Write-Host '   Anlegen unter Settings → Secrets and variables → Actions → Repository secrets.'
}
Write-Host '   Füge ihn direkt bei GitHub ein (Strg+V) und nirgendwo sonst.'
if ($maintenanceSecretName) {
  Read-Host '   Danach Enter drücken' | Out-Null
  Set-Clipboard -Value $maintenanceToken
  Write-Host ''
  Write-Host "2) Der Wert für das GitHub Secret $maintenanceSecretName ist jetzt in der Zwischenablage." -ForegroundColor Yellow
  Write-Host '   Anlegen unter Settings → Secrets and variables → Actions → Repository secrets (nicht im Environment).'
  Read-Host '   Danach Enter drücken' | Out-Null
}
Set-Clipboard -Value ' '
Write-Host ''
Write-Host "Danach: config.php per WebFTP in den Ordner /$folder/ hochladen und den Desktop-Ordner löschen."
