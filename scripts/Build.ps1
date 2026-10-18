[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The .NET Framework C# compiler was not found. Enable .NET Framework 4.8 in Windows.' }
$sources = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'helper') -Filter '*.cs' | ForEach-Object FullName)
& $compiler /nologo /target:winexe /optimize+ /reference:System.Web.Extensions.dll "/out:$outputDir\PrimeVideoRpc.exe" $sources
if ($LASTEXITCODE -ne 0) { throw 'Helper build failed.' }

# Generate the extension's small vector-style icon without any external assets.
Add-Type -AssemblyName System.Drawing
$iconDir = Join-Path $projectRoot 'extension\icons'
New-Item -ItemType Directory -Path $iconDir -Force | Out-Null
foreach ($size in @(16,48,128)) {
    $bitmap = New-Object System.Drawing.Bitmap($size,$size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::FromArgb(19,35,47))
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(31,160,255))
    # A centroid-centered triangle looks right-heavy. Shift it left for optical balance.
    $points = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new($size*0.33,$size*0.25),
        [System.Drawing.PointF]::new($size*0.72,$size*0.5),
        [System.Drawing.PointF]::new($size*0.33,$size*0.75))
    $graphics.FillPolygon($brush,$points)
    $bitmap.Save((Join-Path $iconDir "$size.png"),[System.Drawing.Imaging.ImageFormat]::Png)
    $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
Write-Output "Built $outputDir\PrimeVideoRpc.exe"
