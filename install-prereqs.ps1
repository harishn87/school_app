# Installs everything needed to run Scholaris locally (no Docker):
#   Python 3.12, Node.js 20 LTS, Yarn, MongoDB Community Server (+ mongosh)
# Run:  powershell -ExecutionPolicy Bypass -File .\install-prereqs.ps1
# It asks for admin rights (UAC) once. Safe to re-run: skips what's already installed.

# --- Self-elevate ---
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Start-Process powershell -Verb RunAs -ArgumentList "-NoExit","-ExecutionPolicy","Bypass","-File","`"$PSCommandPath`""
  exit
}
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSCommandPath)

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

if (-not (Has winget)) {
  Write-Host "winget not found. Install 'App Installer' from the Microsoft Store, then re-run." -ForegroundColor Red
  exit 1
}
$wg = @("--accept-package-agreements","--accept-source-agreements","--silent","-e")

# Python (the Microsoft Store 'python' alias doesn't count)
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py -or $py.Source -like "*WindowsApps*") {
  Write-Host "`n==> Installing Python 3.12" -ForegroundColor Cyan
  winget install --id Python.Python.3.12 --scope machine @wg
} else { Write-Host "Python already installed: $(python --version)" -ForegroundColor Green }

if (-not (Has node)) {
  Write-Host "`n==> Installing Node.js 20 LTS" -ForegroundColor Cyan
  winget install --id OpenJS.NodeJS.LTS @wg
} else { Write-Host "Node already installed: $(node --version)" -ForegroundColor Green }

if (-not (Get-Service -Name MongoDB -ErrorAction SilentlyContinue)) {
  Write-Host "`n==> Installing MongoDB Community Server (runs as a Windows service)" -ForegroundColor Cyan
  winget install --id MongoDB.Server @wg
  winget install --id MongoDB.Shell @wg
} else { Write-Host "MongoDB already installed" -ForegroundColor Green }

Refresh-Path
if ((Has npm) -and -not (Has yarn)) {
  Write-Host "`n==> Installing Yarn" -ForegroundColor Cyan
  npm install -g yarn
}

# Make sure MongoDB service is running
$svc = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
if ($svc) {
  if ($svc.Status -ne "Running") { Start-Service MongoDB }
  Set-Service MongoDB -StartupType Automatic
}

Refresh-Path
Write-Host "`n===== Summary =====" -ForegroundColor Cyan
$checks = @(
  @{n="Python";  ok=(Has python); v={ python --version }},
  @{n="Node.js"; ok=(Has node);   v={ node --version }},
  @{n="Yarn";    ok=(Has yarn);   v={ yarn --version }},
  @{n="MongoDB service"; ok=((Get-Service MongoDB -ErrorAction SilentlyContinue).Status -eq "Running"); v={ "running" }}
)
$allOk = $true
foreach ($c in $checks) {
  if ($c.ok) { Write-Host ("OK      {0}: {1}" -f $c.n, (& $c.v)) -ForegroundColor Green }
  else { Write-Host ("MISSING {0}" -f $c.n) -ForegroundColor Red; $allOk = $false }
}
if ($allOk) {
  Write-Host "`nAll set. Next, in a NEW normal PowerShell window:" -ForegroundColor Green
  Write-Host "  powershell -ExecutionPolicy Bypass -File .\start-local.ps1"
} else {
  Write-Host "`nSomething is missing. Close this window, open a new one and re-run this script; if it still fails, note the error text above." -ForegroundColor Yellow
}
