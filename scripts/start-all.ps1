# Arranca las 3 apps de Serbatic Security Inspector:
#   backend :8000 · front :5173 · miniapp demo :3000
# Uso: .\scripts\start-all.ps1   (parar con .\scripts\stop-all.ps1)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path "$root\.tmp\logs" | Out-Null

function Test-Port([int]$Port) {
    return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-App([string]$Name, [int]$Port, [string]$File, [string[]]$ArgList, [string]$Workdir) {
    if (Test-Port $Port) {
        Write-Host "$Name  ⚠ :$Port ya está escuchando (se omite)"
        return
    }
    Start-Process -FilePath $File -ArgumentList $ArgList -WorkingDirectory $Workdir -WindowStyle Hidden `
        -RedirectStandardOutput "$root\.tmp\logs\$Name.log" `
        -RedirectStandardError "$root\.tmp\logs\$Name.err.log"
    Write-Host "$Name  ✓ :$Port  (log: .tmp\logs\$Name.log)"
}

Start-App 'backend' 8000 "$root\backend\.venv\Scripts\python.exe" @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000') "$root\backend"
Start-App 'front'   5173 'npm.cmd' @('run','dev') $root
Start-App 'miniapp' 3000 'npm.cmd' @('start') "$root\samples\miniapp"

Write-Host 'Listo: backend :8000 · front http://localhost:5173 · demo http://localhost:3000'
Write-Host 'Para las 3 apps: .\scripts\stop-all.ps1'
