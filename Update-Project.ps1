param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectPath
)
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path $PSScriptRoot).Path
$target = (Resolve-Path $ProjectPath).Path
if (-not (Test-Path (Join-Path $target 'package.json'))) {
    throw 'ProjectPath must point to the existing jewellery-store folder containing package.json.'
}
if ($source -ne $target -and ($source.StartsWith($target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or $target.StartsWith($source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase))) {
    throw 'Extract the updated project into a separate folder, outside your working project.'
}
Write-Host 'Stop the existing development server with Ctrl+C before continuing.'
if ($source -ne $target) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $target ".update-backups\$stamp"
    $files = Get-ChildItem $source -Recurse -File -Force | Where-Object {
        $relative = $_.FullName.Substring($source.Length + 1)
        $relative -notmatch '(^|[\\/])(node_modules|dist|\.astro|\.data|\.update-backups|\.git)([\\/]|$)' -and
        (-not $_.Name.StartsWith('.env') -or $_.Name -eq '.env.example')
    }
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($source.Length + 1)
        $destination = Join-Path $target $relative
        if (Test-Path $destination) {
            $saved = Join-Path $backup $relative
            New-Item -ItemType Directory -Force -Path (Split-Path $saved -Parent) | Out-Null
            Copy-Item -LiteralPath $destination -Destination $saved -Force
        }
        New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
    }
    Write-Host "Previous code files backed up to $backup"
    Write-Host 'Existing .env files, uploaded media and PostgreSQL data were preserved.'
}
Push-Location $target
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Resolve the error before continuing.' }
    & npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. Resolve the error before starting the website.' }
    Write-Host ''
    Write-Host 'Update complete. Your existing admin account is preserved.'
    Write-Host 'For new installations only: npm.cmd run admin:create'
    Write-Host 'Then run: npm.cmd run dev'
    Write-Host 'Admin page: http://localhost:4321/admin/'
    Write-Host 'Checkout: http://localhost:4321/checkout/ (test mode by default)'
    Write-Host 'My Orders: http://localhost:4321/orders/'
    Write-Host 'My Account: http://localhost:4321/account/'
    Write-Host 'See ACCOUNTS-EMAILS-RETURNS-UPDATE.md for accounts, email previews and returns.'
} finally {
    Pop-Location
}
