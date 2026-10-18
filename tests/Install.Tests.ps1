$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\InstallSupport.ps1')
$testDir = Join-Path ([System.IO.Path]::GetTempPath()) ('prime-rpc-install-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDir | Out-Null
$helperPath = Join-Path $testDir 'PrimeVideoRpc.exe'
try {
    Assert-HelperStopped -Path $helperPath
    Write-Output 'PASS first installation needs no existing helper'
    [System.IO.File]::WriteAllText($helperPath, 'original helper')
    Assert-HelperStopped -Path $helperPath
    Write-Output 'PASS stopped helper can be updated'
    $locked = [System.IO.File]::Open($helperPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    try {
        $blocked = $false
        try { Assert-HelperStopped -Path $helperPath }
        catch { $blocked = $_.Exception.Message -like '*Share on Discord*Install.cmd*' }
        if (-not $blocked) { throw 'A locked helper must produce the update instructions.' }
        if ([System.IO.File]::ReadAllText($helperPath) -ne 'original helper') { throw 'The existing helper was modified.' }
        Write-Output 'PASS running helper is preserved and update instructions are shown'
    } finally { $locked.Dispose() }
    Assert-HelperStopped -Path $helperPath
    Write-Output 'PASS update becomes available once the helper stops'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\dist\PrimeVideoRpc.exe') -Destination $helperPath -Force
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $helperPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $process = [System.Diagnostics.Process]::Start($startInfo)
    try {
        $blocked = $false
        try { Assert-HelperStopped -Path $helperPath }
        catch { $blocked = $_.Exception.Message -like '*Share on Discord*Install.cmd*' }
        if (-not $blocked) { throw 'An executing helper must produce the update instructions.' }
        Write-Output 'PASS an executing helper is detected before update'
    } finally {
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(5000)) { $process.Kill(); $process.WaitForExit() }
        $process.Dispose()
    }
} finally {
    if (Test-Path -LiteralPath $helperPath) { Remove-Item -LiteralPath $helperPath }
    Remove-Item -LiteralPath $testDir
}
