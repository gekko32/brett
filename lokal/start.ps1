# Brett lokal starten (nur Geralds PC).
# Aufruf aus beliebigem Ordner:
#   powershell -ExecutionPolicy Bypass -File <pfad>\lokal\start.ps1
# Danach im Browser: http://localhost:3000/auth/login

$ErrorActionPreference = 'Stop'
$brett = Split-Path -Parent $PSScriptRoot
$envDatei = Join-Path $PSScriptRoot '.env.lokal'

if (-not (Test-Path $envDatei)) {
    Write-Host "Fehlt: $envDatei (Datenbank-Zugang). Claude fragen." -ForegroundColor Red
    exit 1
}
foreach ($zeile in Get-Content $envDatei) {
    if ($zeile -match '^\s*([A-Z_]+)=(.*)$') { Set-Item "env:$($Matches[1])" $Matches[2] }
}

$env:BRETT_LOCAL_DEV = 'true'
# Neuladen während einer laufenden Runde erlauben (sonst 409 nach F5).
$env:BRETT_RECONNECT_GUARD = 'off'
Remove-Item env:MOCK_DB -ErrorAction SilentlyContinue

Set-Location $brett
if (-not (Test-Path 'dist\client\index.html')) {
    Write-Host 'Baue Oberfläche (einmalig) ...'
    npx --no-install vite build
}
# Bilder der Figuren (Gesichter, Zubehör, placement_spec.json) wie im Dockerfile
# nach dist kopieren – sonst fehlen lokal Gesichtsausdruck und Zubehör.
Copy-Item -Path 'public\assets\*' -Destination 'dist\client\assets' -Recurse -Force

# Port 3000 kann belegt sein (z. B. vom Excalidraw-Zeichenserver) → 3001 nehmen.
$port = 3000
if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { $port = 3001 }
$env:PORT = "$port"

Write-Host ''
Write-Host "Brett startet. Browser: http://localhost:$port/auth/login" -ForegroundColor Green
Write-Host 'Beenden mit Strg+C.'
Write-Host ''
npm run dev:server
