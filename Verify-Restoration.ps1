[CmdletBinding()]
param(
    [string]$PgBin = 'C:\Program Files\PostgreSQL\18\bin',
    [string]$DatabaseHost = 'localhost',
    [int]$DatabasePort = 5432,
    [string]$DatabaseUser = 'store',
    [string]$DatabaseName = 'jewellery',
    [string]$ApiOrigin = 'http://localhost:3001'
)
$ErrorActionPreference = 'Stop'
$psql = Join-Path $PgBin 'psql.exe'
if (-not (Test-Path -LiteralPath $psql)) { throw 'PostgreSQL 18 tools not found. Set -PgBin to your installation.' }
& $psql --version
if ($LASTEXITCODE -ne 0) { throw 'Cannot run psql.' }
# No writes, seeding, account creation, credentials or individual records.
$sql = @'
BEGIN READ ONLY;
SELECT current_setting('server_version') AS server_version;
SELECT name, checksum FROM schema_migrations ORDER BY name;
SELECT 'products' AS entity, count(*) AS records FROM products
UNION ALL SELECT 'inventory', count(*) FROM inventory
UNION ALL SELECT 'administrators', count(*) FROM admin_users
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'return_requests', count(*) FROM return_requests;
COMMIT;
'@
& $psql --host=$DatabaseHost --port=$DatabasePort --username=$DatabaseUser --dbname=$DatabaseName -W -X --set=ON_ERROR_STOP=1 --command=$sql
if ($LASTEXITCODE -ne 0) { throw 'Database checks failed. Inspect restoration before continuing.' }
$origin = $ApiOrigin.TrimEnd('/')
Invoke-RestMethod "$origin/health"
Invoke-RestMethod "$origin/ready"
Write-Host 'Read-only checks completed. Compare counts and migration checksums with the old system; inspect orders, stock and images in the existing admin account.'
