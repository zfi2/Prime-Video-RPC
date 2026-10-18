[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'Build.ps1')
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$sources = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'helper') -Filter '*.cs' | ForEach-Object FullName)
$testExe = Join-Path $projectRoot 'dist\HelperTests.exe'
& $compiler /nologo /target:exe /main:HelperTests /reference:System.Web.Extensions.dll "/out:$testExe" $sources (Join-Path $projectRoot 'tests\HelperTests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Helper test build failed.' }
& $testExe
if ($LASTEXITCODE -ne 0) { throw 'Helper tests failed.' }
& (Join-Path $projectRoot 'tests\Install.Tests.ps1')
$testFiles = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'tests') -Filter '*.test.cjs' | ForEach-Object FullName)
& node --test $testFiles
if ($LASTEXITCODE -ne 0) { throw 'Extension tests failed.' }
