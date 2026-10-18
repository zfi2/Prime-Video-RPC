function Assert-HelperStopped {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    try {
        $file = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $file.Dispose()
    } catch [System.IO.IOException] {
        throw 'The helper is still running or its file is in use. Switch off "Share on Discord" in the extension (in every Chrome profile), wait a few seconds, then run Install.cmd again.'
    } catch [System.UnauthorizedAccessException] {
        throw 'The helper file cannot be updated. Run Install.cmd from the same Windows account used to install it and check the file permissions.'
    }
}
