# Deploy script for Drama15 Lite Studio - Production
# Usage: .\deploy.ps1
#
# This script:
#   1. Builds the web client (Vite → apps/web/dist/)
#   2. Copies cloudflared config
#   3. Starts the API server with production env

$ErrorActionPreference = "Stop"

Write-Host "=== Drama15 Production Deploy ===" -ForegroundColor Cyan

# Step 1: Build web client
Write-Host "`n[1/4] Building web client..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\apps\web"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Web build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "OK: Web client built to dist/" -ForegroundColor Green

# Step 2: Update cloudflared config
Write-Host "`n[2/4] Updating Cloudflare Tunnel config..." -ForegroundColor Yellow
$configPath = "C:\Users\$env:USERNAME\.cloudflared\config.yml"
$sourceConfig = "$PSScriptRoot\ops\cloudflared-config.yml"

if (Test-Path $sourceConfig) {
    Copy-Item $sourceConfig $configPath -Force
    Write-Host "OK: Cloudflare Tunnel config updated" -ForegroundColor Green
} else {
    Write-Host "WARN: ops/cloudflared-config.yml not found, skipping tunnel config update" -ForegroundColor Yellow
}

# Step 3: Prepare production environment
Write-Host "`n[3/4] Setting up production environment..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\apps\api"
if (Test-Path ".env.production") {
    Copy-Item ".env.production" ".env" -Force
    Write-Host "OK: Production .env configured" -ForegroundColor Green
} else {
    Write-Host "ERROR: .env.production not found!" -ForegroundColor Red
    exit 1
}

# Step 4: Start API server
Write-Host "`n[4/4] Starting API server..." -ForegroundColor Yellow
Write-Host "API will be available at:" -ForegroundColor Cyan
Write-Host "  - http://localhost:3001"
Write-Host "  - https://drama.novelkit.cc (via Cloudflare Tunnel)"
Write-Host "  - https://api.vibify.work (via Cloudflare Tunnel)"
Write-Host "`nPress Ctrl+C to stop the server" -ForegroundColor Yellow

# Start the API server
npx tsx src/startDev.ts
