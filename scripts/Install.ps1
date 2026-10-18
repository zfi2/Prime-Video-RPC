[CmdletBinding()]
param([ValidatePattern('^[a-p]{32}$')][string]$ExtensionId = 'mipnpehfphnakidmagfbbggbchfphlhn')
$ErrorActionPreference = 'Stop'
if (-not $ExtensionId) { $ExtensionId = (Read-Host 'Paste the extension ID from chrome://extensions').Trim() }
if ($ExtensionId -notmatch '^[a-p]{32}$') { throw 'The extension ID must be 32 lowercase letters from a to p.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'Build.ps1')
$installDir = Join-Path $env:LOCALAPPDATA 'PrimeVideoDiscordRPC'
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\PrimeVideoRpc.exe') -Destination (Join-Path $installDir 'PrimeVideoRpc.exe') -Force
$manifestPath = Join-Path $installDir 'com.lain.prime_video_rpc.json'
$manifest = [ordered]@{
    name = 'com.lain.prime_video_rpc'
    description = 'Prime Video Discord Rich Presence helper'
    path = (Join-Path $installDir 'PrimeVideoRpc.exe')
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
[System.IO.File]::WriteAllText($manifestPath,($manifest | ConvertTo-Json -Depth 4),(New-Object System.Text.UTF8Encoding($false)))
$registryKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.lain.prime_video_rpc'
New-Item -Path $registryKey -Force | Out-Null
Set-Item -LiteralPath $registryKey -Value $manifestPath
Write-Output 'Installed for your Windows account. Open the extension popup and click reconnect.'
Write-Output "Helper location: $installDir"
