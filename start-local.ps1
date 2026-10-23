# Runs Scholaris locally WITHOUT Docker and WITHOUT Node/Yarn.
# The backend serves the ready-built app (frontend\build) on one address: http://localhost:8001
# Needs: Python 3.11+ and MongoDB running on localhost:27017 (INSTALL-PREREQS.cmd sets both up).
#
#   Double-click START-APP.cmd   (or: powershell -ExecutionPolicy Bypass -File .\start-local.ps1)
#   Frontend developers who want hot reload:  .\start-local.ps1 -Dev   (needs Node + yarn install)
param([switch]$Dev)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
# Pick up tools installed since this window/Explorer started
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

function Fail($msg) { Write-Host $msg -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }

if (-not (Get-Command python -ErrorAction SilentlyContinue) -and -not (Get-Command py -ErrorAction SilentlyContinue)) {
  Fail "Python is not installed. Run INSTALL-PREREQS.cmd first."
}
$mongo = Test-NetConnection -ComputerName localhost -Port 27017 -WarningAction SilentlyContinue
if (-not $mongo.TcpTestSucceeded) {
  $svc = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
  if ($svc) { Fail "MongoDB is installed but not running. Open 'Services', find MongoDB Server and click Start (or restart the PC)." }
  Fail "MongoDB is not installed. Run INSTALL-PREREQS.cmd first."
}

# --- Free port 8001 if an old server is still running ---
$old = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue
if ($old) {
  Write-Host "Stopping the old server on port 8001..." -ForegroundColor Yellow
  $old | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
}

# --- Backend settings ---
$be = Join-Path $root "backend"
if (-not (Test-Path "$be\.env")) {
@"
ENV=development
MONGO_URL=mongodb://localhost:27017
JWT_SECRET=local-dev-secret-change-me
CORS_ORIGINS=http://localhost:3000,http://localhost:8001
SUPERADMIN_EMAIL=owner@example.com
SUPERADMIN_PASSWORD=OwnerPass#2026
SEED_DEMO=true
"@ | Set-Content "$be\.env"
} else {
  # Upgrade an older .env with the settings the multi-school version needs
  $envText = Get-Content "$be\.env" -Raw
  $add = @()
  if ($envText -notmatch "SUPERADMIN_EMAIL") { $add += "SUPERADMIN_EMAIL=owner@example.com"; $add += "SUPERADMIN_PASSWORD=OwnerPass#2026" }
  if ($envText -notmatch "SEED_DEMO") { $add += "SEED_DEMO=true" }
  if ($add.Count -gt 0) { Add-Content "$be\.env" ("`r`n" + ($add -join "`r`n")) }
}

# --- Python environment ---
if (-not (Test-Path "$be\.venv\Scripts\python.exe")) {
  $made = $false
  if (Get-Command py -ErrorAction SilentlyContinue) { py -3.12 -m venv "$be\.venv"; $made = $LASTEXITCODE -eq 0 }
  if (-not $made) { python -m venv "$be\.venv" }
}
Write-Host "Checking backend packages..." -ForegroundColor Cyan
& "$be\.venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r "$be\requirements.txt"
if ($LASTEXITCODE -ne 0) { Fail "Backend package install failed (see above). Check your internet connection and try again." }

if ($Dev) {
  # Old two-server mode with React hot reload
  $fe = Join-Path $root "frontend"
  "REACT_APP_BACKEND_URL=http://localhost:8001" | Set-Content "$fe\.env"
  Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$be'; .\.venv\Scripts\python.exe -m uvicorn server:app --reload --port 8001"
  Push-Location $fe
  yarn install --registry https://registry.npmjs.org --network-timeout 600000 --network-concurrency 4
  Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$fe'; yarn start"
  Pop-Location
  exit 0
}

if (-not (Test-Path (Join-Path $root "frontend\build\index.html"))) {
  Fail "frontend\build is missing. Build it once: open a terminal in the frontend folder and run  yarn install  then  yarn build  (or run this script with -Dev)."
}

Write-Host ""
Write-Host "Starting Scholaris at http://localhost:8001 ..." -ForegroundColor Green
Write-Host "  Demo school:      code 'demo'  /  admin@school.com  /  admin123" -ForegroundColor Green
Write-Host "  Platform console: http://localhost:8001/platform/login  (owner@example.com / OwnerPass#2026)" -ForegroundColor Green
Write-Host "  Keep this window open while you use the app. Close it to stop." -ForegroundColor Yellow
Write-Host ""
Start-Job -ScriptBlock { Start-Sleep -Seconds 6; Start-Process "http://localhost:8001/login" } | Out-Null
Set-Location $be
& "$be\.venv\Scripts\python.exe" -m uvicorn server:app --host 127.0.0.1 --port 8001
