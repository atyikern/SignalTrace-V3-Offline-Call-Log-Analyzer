[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $repoRoot '.tracedesk/processes.json'

if (-not (Test-Path $stateFile)) {
    Write-Host 'No TraceDesk process record was found. Nothing to stop.' -ForegroundColor Yellow
    exit 0
}

$state = Get-Content $stateFile -Raw | ConvertFrom-Json
foreach ($entry in @(@{ Name = 'Caddy'; Id = $state.caddyPid }, @{ Name = 'Vite'; Id = $state.vitePid })) {
    if ($entry.Id -and (Get-Process -Id $entry.Id -ErrorAction SilentlyContinue)) {
        & taskkill.exe /PID $entry.Id /T /F | Out-Null
        Write-Host "Stopped $($entry.Name) (PID $($entry.Id))."
    } else {
        Write-Host "$($entry.Name) was already stopped."
    }
}

Remove-Item $stateFile -Force
Write-Host 'TraceDesk services stopped.' -ForegroundColor Green
