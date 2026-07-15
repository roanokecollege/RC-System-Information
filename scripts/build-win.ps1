# RC System Dashboard - Windows Build Setup

$ErrorActionPreference = "Stop"

# Project root is wherever the .bat launched from
$ProjectRoot = $PWD.Path

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RC System Dashboard - Windows Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot" -ForegroundColor DarkGray
Write-Host ""

# ── 1. Check Node.js ──────────────────────────────────────────
Write-Host "Checking for Node.js..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Installing via winget..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "Node.js install failed. Please install manually from https://nodejs.org and re-run this script." -ForegroundColor Red
        pause
        exit 1
    }
}

$nodeVersion = node --version
Write-Host "Node.js $nodeVersion found." -ForegroundColor Green

# ── 2. Check .env ─────────────────────────────────────────────
Write-Host ""
Write-Host "Checking for .env file..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    if (Test-Path "scripts\env-values.txt") {
        Write-Host "Loading values from scripts\env-values.txt..." -ForegroundColor Yellow
        Copy-Item "scripts\env-values.txt" ".env"
        Write-Host ".env created from env-values.txt." -ForegroundColor Green
    } else {
        Write-Host ".env not found. Please enter the required values:" -ForegroundColor Yellow
        Write-Host ""
        $authToken = Read-Host "AUTH_TOKEN"
        $publicIpEndpoint = Read-Host "PUBLIC_IP_ENDPOINT"
        $sendReportEndpoint = Read-Host "SEND_REPORT_ENDPOINT"
        @(
            "AUTH_TOKEN=$authToken",
            "PUBLIC_IP_ENDPOINT=$publicIpEndpoint",
            "SEND_REPORT_ENDPOINT=$sendReportEndpoint"
        ) | Set-Content ".env"
        Write-Host ".env created." -ForegroundColor Green
    }
} else {
    Write-Host ".env already exists, skipping." -ForegroundColor Green
}

# ── 3. Install dependencies ───────────────────────────────────
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed with exit code $LASTEXITCODE" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "Dependencies installed." -ForegroundColor Green

# ── 4. Build ──────────────────────────────────────────────────
Write-Host ""
Write-Host "Building Windows app..." -ForegroundColor Yellow

# Skip code signing — no certificate configured.
# CSC_IDENTITY_AUTO_DISCOVERY only stops electron-builder from searching the
# Windows certificate store on its own; it does NOT override an explicit
# CSC_LINK/WIN_CSC_LINK if one is already set machine-wide (e.g. by IT for
# something unrelated). An inherited CSC_LINK is what causes signtool to
# hang on the timestamp-server call, so warn if one is present, then clear
# all cert env vars before building.
$inheritedCscVars = @("CSC_LINK", "WIN_CSC_LINK") | Where-Object { Test-Path "Env:$_" }
if ($inheritedCscVars) {
    Write-Host ""
    Write-Host "WARNING: found pre-existing signing env var(s): $($inheritedCscVars -join ', ')" -ForegroundColor Red
    Write-Host "This project has no code-signing certificate configured, so these will be" -ForegroundColor Red
    Write-Host "cleared for this build to avoid signtool hanging on a timestamp-server call." -ForegroundColor Red
    Write-Host "If this machine is meant to sign builds, configure signing in electron-builder.json instead." -ForegroundColor Red
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
$env:CSC_LINK = ""
$env:CSC_KEY_PASSWORD = ""
$env:WIN_CSC_LINK = ""
$env:WIN_CSC_KEY_PASSWORD = ""

npm run dist:win
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    pause
    exit 1
}

# ── 5. Done ───────────────────────────────────────────────────
$releasePath = Join-Path $ProjectRoot "release"

if (-not (Test-Path $releasePath)) {
    Write-Host "Build appeared to succeed but release/ folder was not found at:" -ForegroundColor Red
    Write-Host $releasePath -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Build complete!" -ForegroundColor Green
Write-Host "  Output: $releasePath" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Start-Process explorer.exe -ArgumentList $releasePath

pause
