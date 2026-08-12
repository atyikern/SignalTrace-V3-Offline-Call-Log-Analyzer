[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $repoRoot '.tracedesk'
$stateFile = Join-Path $stateDirectory 'processes.json'

function Test-PortOccupied([int]$Port) {
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Stop-RecordedProcess([int]$ProcessId) {
    if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
        & taskkill.exe /PID $ProcessId /T /F | Out-Null
    }
}

if (-not (Get-Command caddy -ErrorAction SilentlyContinue)) {
    throw "Caddy is not installed or is not on PATH. Install it with: winget install CaddyServer.Caddy"
}

foreach ($port in 80, 5173) {
    if (Test-PortOccupied $port) {
        throw "Port $port is already in use. Inspect it with: Get-NetTCPConnection -LocalPort $port"
    }
}

if (Test-Path $stateFile) {
    throw "TraceDesk has an existing process record. Run npm run stop:tracedesk before starting it again."
}

New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
$vite = $null
$caddy = $null

try {
    $vite = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $repoRoot -RedirectStandardOutput (Join-Path $stateDirectory 'vite.log') -RedirectStandardError (Join-Path $stateDirectory 'vite-error.log') -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(20)
    while (-not (Test-PortOccupied 5173)) {
        $vite.Refresh()
        if ($vite.HasExited) { throw "Vite exited before opening port 5173. Review .tracedesk/vite-error.log." }
        if ((Get-Date) -gt $deadline) { throw "Vite did not open port 5173 within 20 seconds." }
        Start-Sleep -Milliseconds 250
    }

    $caddy = Start-Process -FilePath 'caddy.exe' -ArgumentList @('run', '--config', (Join-Path $repoRoot 'Caddyfile'), '--adapter', 'caddyfile') -WorkingDirectory $repoRoot -RedirectStandardOutput (Join-Path $stateDirectory 'caddy.log') -RedirectStandardError (Join-Path $stateDirectory 'caddy-error.log') -PassThru -WindowStyle Hidden
    Start-Sleep -Milliseconds 800
    $caddy.Refresh()
    if ($caddy.HasExited -or -not (Test-PortOccupied 80)) {
        throw "Caddy could not open port 80. Try PowerShell as Administrator and review .tracedesk/caddy-error.log."
    }

    @{ vitePid = $vite.Id; caddyPid = $caddy.Id; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8
    Write-Host "TraceDesk is running at http://tracedesk.localhost" -ForegroundColor Green
    Write-Host "Direct Vite access remains available at http://localhost:5173"
    Write-Host "Run npm run stop:tracedesk to stop both services."
} catch {
    if ($caddy) { Stop-RecordedProcess $caddy.Id }
    if ($vite) { Stop-RecordedProcess $vite.Id }
    Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
    throw
}
