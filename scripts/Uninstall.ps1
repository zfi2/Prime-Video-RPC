[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$registryKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.lain.prime_video_rpc'
if (Test-Path -LiteralPath $registryKey) { Remove-Item -LiteralPath $registryKey }
# Remove only the two files this installer owns. Leave any other files alone.
$installDir = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'PrimeVideoDiscordRPC'))
foreach ($filename in @('PrimeVideoRpc.exe','com.lain.prime_video_rpc.json')) {
    $target = [System.IO.Path]::GetFullPath((Join-Path $installDir $filename))
    if ([System.IO.Path]::GetDirectoryName($target) -ne $installDir) { throw 'Unexpected uninstall path.' }
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
}
Write-Output 'Helper removed. Remove the extension from chrome://extensions as well.'
