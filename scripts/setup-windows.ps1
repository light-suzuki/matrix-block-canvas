[CmdletBinding()]
param(
    [switch]$SkipNodeInstall,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Refresh-ProcessPath {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = (($machine, $user) -join ";").Trim(";")
}

function Test-SupportedNode {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        return $false
    }

    $raw = (& node --version).Trim().TrimStart("v")
    $parts = $raw.Split(".")
    if ($parts.Count -lt 2) {
        return $false
    }

    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    return ($major -gt 20) -or ($major -eq 20 -and $minor -ge 19)
}

Write-Host "Matrix Block Canvas - Windows setup" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"

if (-not (Test-SupportedNode)) {
    if ($SkipNodeInstall) {
        throw "Node.js 20.19+ is required. Install the current Node.js LTS release and run this script again."
    }

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "Node.js 20.19+ was not found and winget is unavailable. Install Node.js LTS from https://nodejs.org/ and run SETUP_WINDOWS.cmd again."
    }

    Write-Host "Installing/updating Node.js LTS with winget..." -ForegroundColor Yellow
    & winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget could not install Node.js LTS (exit code $LASTEXITCODE)."
    }

    Refresh-ProcessPath
    if (-not (Test-SupportedNode)) {
        throw "Node.js was installed, but this terminal cannot see the new PATH yet. Close this window and run SETUP_WINDOWS.cmd once more."
    }
}

$nodeVersion = (& node --version).Trim()
$npmVersion = (& npm --version).Trim()
Write-Host "Node: $nodeVersion"
Write-Host "npm : $npmVersion"

Write-Host "Installing locked dependencies (npm ci)..." -ForegroundColor Yellow
& npm ci
if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed (exit code $LASTEXITCODE)."
}

Write-Host "Running typecheck, production build, and portable build..." -ForegroundColor Yellow
& npm run check
if ($LASTEXITCODE -ne 0) {
    throw "Project validation failed (exit code $LASTEXITCODE)."
}

$PortablePath = Join-Path $ProjectRoot "dist\MatrixBlockCanvas-portable.html"
if (-not (Test-Path $PortablePath)) {
    throw "Portable build was not created: $PortablePath"
}

Write-Host "" 
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Portable app: $PortablePath"
Write-Host "You can copy that single HTML file to another Windows PC and open it in Edge/Chrome/Firefox."

if (-not $NoOpen) {
    Start-Process $PortablePath
}
