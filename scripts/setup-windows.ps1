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

    if ($major -eq 20) {
        return $minor -ge 19
    }

    return ($major -gt 22) -or ($major -eq 22 -and $minor -ge 12)
}

function Get-NpmCommand {
    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCmd) {
        return $npmCmd.Source
    }

    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if ($npm) {
        return $npm.Source
    }

    throw "npm was not found even though Node.js is available. Reinstall Node.js LTS and try again."
}

Write-Host "Matrix Block Canvas - Windows setup" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"

if ($ProjectRoot.Contains("&")) {
    throw "The project path contains '&', which can break npm/Vite command shims on Windows. Move the folder to a path without '&' and run SETUP_WINDOWS.cmd again."
}

if (-not (Test-SupportedNode)) {
    if ($SkipNodeInstall) {
        throw "Supported Node.js is required: 20.19-20.x or 22.12+. Install the current Node.js LTS release and run this script again."
    }

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "Supported Node.js was not found and winget is unavailable. Install the current Node.js LTS release from https://nodejs.org/ and run SETUP_WINDOWS.cmd again."
    }

    Write-Host "Installing/updating Node.js LTS with winget..." -ForegroundColor Yellow
    & winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget could not install Node.js LTS (exit code $LASTEXITCODE)."
    }

    Refresh-ProcessPath
    if (-not (Test-SupportedNode)) {
        throw "Node.js was installed, but this terminal cannot see a supported version yet. Close this window and run SETUP_WINDOWS.cmd once more."
    }
}

$npmCommand = Get-NpmCommand
$nodeVersion = (& node --version).Trim()
$npmVersion = (& $npmCommand --version).Trim()
Write-Host "Node: $nodeVersion"
Write-Host "npm : $npmVersion"

Write-Host "Installing locked dependencies (npm ci)..." -ForegroundColor Yellow
& $npmCommand ci
if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed (exit code $LASTEXITCODE)."
}

Write-Host "Running typecheck, production build, and portable build..." -ForegroundColor Yellow
& $npmCommand run check
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
