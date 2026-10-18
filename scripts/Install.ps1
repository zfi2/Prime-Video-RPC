[CmdletBinding()]
param([ValidatePattern('^[a-p]{32}$')][string]$ExtensionId = 'mipnpehfphnakidmagfbbggbchfphlhn')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'InstallSupport.ps1')
if (-not $ExtensionId) { $ExtensionId = (Read-Host 'Paste the extension ID from chrome://extensions').Trim() }
if ($ExtensionId -notmatch '^[a-p]{32}$') { throw 'The extension ID must be 32 lowercase letters from a to p.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$installDir = Join-Path $env:LOCALAPPDATA 'PrimeVideoDiscordRPC'
$helperPath = Join-Path $installDir 'PrimeVideoRpc.exe'
Assert-HelperStopped -Path $helperPath
& (Join-Path $PSScriptRoot 'Build.ps1')
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
try {
    Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\PrimeVideoRpc.exe') -Destination $helperPath -Force
} catch {
    # Chrome could start the helper after the first check.
    Assert-HelperStopped -Path $helperPath
    throw
}
$manifestPath = Join-Path $installDir 'com.lain.prime_video_rpc.json'
$manifest = [ordered]@{
    name = 'com.lain.prime_video_rpc'
    description = 'Prime Video Discord Rich Presence helper'
    path = $helperPath
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
[System.IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Depth 4),(New-Object System.Text.UTF8Encoding($false)))
$registryKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.lain.prime_video_rpc'
New-Item -Path $registryKey -Force | Out-Null
Set-Item -LiteralPath $registryKey -Value $manifestPath
Write-Output 'Installed for your Windows account. Open the extension popup and click reconnect.'
Write-Output "Helper location: $installDir"
