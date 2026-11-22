# Para las 2 apps matando los procesos que escuchan en sus puertos (8000, 5173).
foreach ($port in 8000, 5173) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($null -eq $conns) {
        Write-Host ":$port  libre (nada que matar)"
        continue
    }
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        Write-Host ":$port  matado (PID $p)"
    }
}
Write-Host 'Todo parado.'
