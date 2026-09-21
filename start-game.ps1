param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
function Get-GameHealth([string]$Address) {
    $request = [System.Net.WebRequest]::Create($Address)
    $request.Proxy = $null
    $request.Timeout = 1000
    $response = $request.GetResponse()
    try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    } finally { $response.Dispose() }
}
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $nodePath = $nodeCommand.Source
} else {
    $nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $nodePath)) {
    Write-Host 'Node.js is required. Install Node.js LTS from https://nodejs.org and run this file again.'
    Read-Host 'Press Enter to close'
    exit 1
}
$gamePort = 5173
$alreadyRunning = $false
for ($candidatePort = 5173; $candidatePort -le 5183; $candidatePort++) {
    try {
        $health = Get-GameHealth "http://127.0.0.1:$candidatePort/__lapsha_health"
        if ($health -eq 'lapsha-3d-v1') { $gamePort = $candidatePort; $alreadyRunning = $true; break }
    } catch {}
    $probe = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $candidatePort)
    try { $probe.Start(); $probe.Stop(); $gamePort = $candidatePort; break } catch { $probe.Stop() }
}
$gameUrl = "http://127.0.0.1:$gamePort/"
if (-not $alreadyRunning) {
    $serverScript = Join-Path $PSScriptRoot 'serve.cjs'
    Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serverScript + '"'), "$gamePort") -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 200
        try { $health = Get-GameHealth ($gameUrl + '__lapsha_health'); if ($health -eq 'lapsha-3d-v1') { $ready = $true; break } } catch {}
    }
    if (-not $ready) { throw 'Could not start the local game server.' }
}
Write-Output $gameUrl
if (-not $NoBrowser) { Start-Process $gameUrl }
