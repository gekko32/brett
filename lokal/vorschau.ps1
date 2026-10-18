# Brett-Vorschau mit sofort sichtbaren Änderungen (nur Geralds PC).
# Startet den Brett-Server (startet bei Code-Änderungen selbst neu) und die
# Vite-Vorschau (zeigt Änderungen an der Oberfläche sofort, ohne Bauen).
# Aufruf aus beliebigem Ordner:
#   powershell -ExecutionPolicy Bypass -File <pfad>\lokal\vorschau.ps1
# Danach im Browser: http://localhost:5173/auth/login
# Hinweis: Anmeldungen bleiben über Neustarts erhalten (Datenbank).

$ErrorActionPreference = 'Stop'
$brett = Split-Path -Parent $PSScriptRoot
$envDatei = Join-Path $PSScriptRoot '.env.lokal'
if (-not (Test-Path $envDatei)) {
    # Zugang liegt im alten Arbeitsordner (Bachelorprojekt), falls hier keiner liegt.
    $envDatei = Join-Path $brett '..\Bachelorprojekt\components\brett\lokal\.env.lokal'
}
if (-not (Test-Path $envDatei)) {
    Write-Host "Fehlt: .env.lokal (Datenbank-Zugang). Claude fragen." -ForegroundColor Red
    exit 1
}
foreach ($zeile in Get-Content $envDatei) {
    if ($zeile -match '^\s*([A-Z_]+)=(.*)$') { Set-Item "env:$($Matches[1])" $Matches[2] }
}

$env:BRETT_LOCAL_DEV = 'true'
$env:BRETT_RECONNECT_GUARD = 'off'
Remove-Item env:MOCK_DB -ErrorAction SilentlyContinue

# Port 3000 kann belegt sein (z. B. vom Excalidraw-Zeichenserver) → 3001 nehmen.
$port = 3000
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { $port = 3001 }
$env:PORT = "$port"
$env:BRETT_SERVER_PORT = "$port"

Set-Location $brett
Write-Host ''
Write-Host 'Vorschau startet. Browser: http://localhost:5173/auth/login' -ForegroundColor Green
Write-Host "(Brett-Server läuft dahinter auf Port $port.) Beenden mit Strg+C."
Write-Host ''
npx --no-install concurrently -n server,vorschau -c yellow,cyan "npm:dev:server" "npm:dev:client"
