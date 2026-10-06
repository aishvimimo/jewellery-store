[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ProjectPath,
    [Parameter(Mandatory = $true)][string]$OutputZip
)
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath $ProjectPath).Path.TrimEnd('\', '/')
$zipPath = [System.IO.Path]::GetFullPath($OutputZip)
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'package-lock.json'))) {
    throw 'ProjectPath must be the jewellery-store folder containing package.json and package-lock.json.'
}
if ($zipPath.StartsWith($sourceRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Save OutputZip outside the project directory.'
}
if (Test-Path -LiteralPath $zipPath) { throw 'OutputZip already exists. Choose a new filename.' }
$excludedDirectories = @('node_modules', 'dist', '.astro', '.git', 'coverage', '.data', '.update-backups', '.vercel', '.wrangler')
$excludedFiles = @('.npmrc', '.pgpass', 'pgpass.conf', '.DS_Store')
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipParent = Split-Path -Parent $zipPath
[System.IO.Directory]::CreateDirectory($zipParent) | Out-Null
$stream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
$archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
$count = 0
try {
    # Walk explicitly so excluded directories and symbolic links are not traversed.
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($sourceRoot)
    while ($pending.Count -gt 0) {
        $directory = $pending.Pop()
        foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
            if ($item.PSIsContainer) {
                if ($excludedDirectories -notcontains $item.Name) { $pending.Push($item.FullName) }
                continue
            }
            if ($excludedFiles -contains $item.Name) { continue }
            if (($item.Name -eq '.env' -or $item.Name -like '.env.*') -and $item.Name -ne '.env.example') { continue }
            if ($item.Name -match '\.(zip|dump|backup|log|tsbuildinfo|pem|key|pfx|p12)$') { continue }
            $relative = $item.FullName.Substring($sourceRoot.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $item.FullName, 'jewellery-store/' + $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
            $count++
        }
    }
} finally {
    $archive.Dispose()
    $stream.Dispose()
}
Write-Host "Created source-only ZIP with $count files: $zipPath"
Write-Host 'Review custom files for secrets before uploading. Database, actual .env files and uploaded media are excluded.'
Get-FileHash -LiteralPath $zipPath -Algorithm SHA256
