# Project handover — resume on another Windows system and ChatGPT Work profile

Snapshot date: 6 October 2026. Latest completed milestone: customer accounts, order/security emails and full-order returns/refund management. The user reports the local setup is working. The next milestone is a test deployment; hosting accounts and provider credentials still need configuration.

## 1. What to transfer

There are two separate transfers: a source package for the new chat, and private runtime data for the new computer. A source ZIP alone cannot preserve the database or local uploads.

| Item | Where it comes from | Destination |
|---|---|---|
| Source ZIP including this guide and RESUME-PROMPT.txt | Current working project or supplied handover ZIP | New computer; attach to new ChatGPT Work chat |
| PostgreSQL custom-format backup | Running database, exported with pg_dump | New computer only; contains customer/order data and credential hashes |
| apps/api/.env | Existing working project | Same relative path on new computer, privately |
| apps/storefront/.env | Existing working project | Same relative path on new computer, privately |
| Local uploaded images | Normally apps/api/.data/media | Same relative path on new computer, privately |
| Any non-default MEDIA_LOCAL_DIR | API .env setting | Restore that folder and update its path if necessary |
| Guest private order codes | Old browser's My Orders page | Save privately if needed; browser history is not inside the project |

Use an encrypted drive/archive or another private transfer method for database/configuration files. Do not upload actual .env files, database backups, private order codes or credentials to the new chat or GitHub. This source package contains examples, not your actual Windows .env, database or user-uploaded media.

The package prepared in this chat is the latest assistant-produced source. If you have changed files on your Windows system after downloading it, package **your existing working folder** instead so those edits are preserved. Copy this guide, RESUME-PROMPT.txt and Create-Handover-Zip.ps1 into that folder first. Inspect any custom files for hard-coded secrets before sharing.

### Files to include in the source ZIP

Keep the full project hierarchy: apps/api source/tests/configuration, apps/storefront source/public assets/tests/configuration, packages/contracts, database/migrations and seeds.json, scripts, package.json, package-lock.json, TypeScript configuration, Dockerfile.api, railway.json, docker-compose.yml, Update-Project.ps1, all project guides, .gitignore, .dockerignore and both .env.example files. Include downloaded sample assets under apps/storefront/public/assets; they are required by the current design.

Exclude node_modules, generated dist/.astro, .git, coverage, logs, .data, .update-backups, actual .env files, database dumps, credentials and nested ZIPs. The supplied PowerShell script excludes these automatically, including .env.local and other .env variants; .env.example stays included. The script does not inspect the contents of custom files for secrets.

On the old computer, stop npm.cmd run dev using Ctrl+C. In PowerShell, replace these example paths with your actual paths:

```powershell
$projectPath = 'C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store'
$transferPath = 'C:\StoreTransfer'
New-Item -ItemType Directory -Force -Path $transferPath | Out-Null
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$projectPath\Create-Handover-Zip.ps1" -ProjectPath $projectPath -OutputZip "$transferPath\jewellery-store-source.zip"
```

Choose a new ZIP name if it already exists. The script refuses to overwrite a file or save the ZIP inside the project. It prints a SHA-256 checksum for optional transfer integrity comparison. This new packaging script has been reviewed here but has not been executed in Windows PowerShell.

## 2. Export the old PostgreSQL database

Stop the API before making the final backup and copying uploads; avoid changes on the old system after this point. Leave PostgreSQL itself running. If the database is shared with another running API, pause its writes too.

Read host, port, database name and user from your actual apps/api/.env DATABASE_URL. Do not assume the example values match your machine. Use pg_dump from the source PostgreSQL major version or a compatible newer tool. The example below assumes PostgreSQL 17, localhost, database jewellery and login store. Replace the values as needed. The -W flag prompts for the database password; do not include passwords in the command.

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$transferPath = 'C:\StoreTransfer'
& "$pgBin\pg_dump.exe" --host=localhost --port=5432 --username=store --dbname=jewellery --format=custom --no-owner --no-acl --file="$transferPath\jewellery.dump" -W
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed. Do not continue.' }
& "$pgBin\pg_restore.exe" --list "$transferPath\jewellery.dump"
if ($LASTEXITCODE -ne 0) { throw 'Backup cannot be read.' }
```

Listing the archive proves it is readable, not that restoration has succeeded. The restore steps below are the real check. The dump includes schema_migrations, products, stock, administrator/customer hashes, orders, payment sessions, return cases and the encrypted email outbox. It does not include PostgreSQL server roles/passwords or image files.

Privately copy the two actual .env files and the entire local media folder. The usual upload directory is apps/api/.data/media because npm runs the API from its workspace. If MEDIA_LOCAL_DIR is custom, transfer that location instead. If you already use R2, keep the existing bucket/object URLs and private configuration; local copying does not download R2 objects.

Preserve EMAIL_ENCRYPTION_KEY exactly when transferring an existing database with queued email payloads. If it is absent in development, the existing development fallback is still used; do not switch keys during the local move. Move to a private production key using the procedure in ACCOUNTS-EMAILS-RETURNS-UPDATE.md after local restoration. Also preserve any original Razorpay test key for unresolved payment sessions; do not silently rotate accounts/keys during the move.

## 3. Install prerequisites on the new Windows computer

1. Install **Node.js 24**, including npm. Open a new PowerShell window after installation. The project requires npm 11 or later; check the versions below.
2. Install **PostgreSQL 17** with the database server and command-line tools. Prefer the same major version as the source database for this move. If your old database uses another major version, record that and use a compatible restore target rather than guessing.
3. Git is needed for the later GitHub/deployment step, but is optional for running a downloaded ZIP locally.
4. An editor such as VS Code is optional. Docker is **not required** when PostgreSQL is installed directly.

Astro, React, Fastify, Drizzle, TypeScript and all remaining project dependencies install from package-lock.json using npm.cmd ci. Do not install Astro globally or scaffold a second Astro project.

```powershell
node --version
npm.cmd --version
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' --version
Get-Service -Name '*postgres*'
```

Expect Node v24.x and npm 11+. Confirm the PostgreSQL service is running through Windows Services if needed. A custom installer location requires adjusting $pgBin. Keep both PostgreSQL and API ports available: database 5432, API 3001 and storefront 4321 by default.

## 4. Restore the existing database — preferred path

Extract the source ZIP to a new location, for example C:\Projects\jewellery-store. Work inside the folder containing package.json, not its parent. Avoid merging it into an unrelated project. You do not need Update-Project.ps1 when starting from this complete source on a new computer.

Create a fresh empty database and login. If the old login already exists on this server, reuse the intended login and skip CREATE ROLE. The following interactive psql steps assume a new login store and database jewellery. Use your own names if different. \password prompts for a new local database password without placing it in SQL history.

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
& "$pgBin\psql.exe" --host=localhost --port=5432 --username=postgres --dbname=postgres -W
```

At the psql prompt:

```sql
CREATE ROLE store LOGIN;
\password store
CREATE DATABASE jewellery OWNER store;
\q
```

Restore **before** running application migrations into this empty database:

```powershell
& "$pgBin\pg_restore.exe" --host=localhost --port=5432 --username=store --dbname=jewellery --no-owner --no-acl --exit-on-error 'C:\StoreTransfer\jewellery.dump' -W
if ($LASTEXITCODE -ne 0) { throw 'Restore failed. Inspect the error before continuing.' }
```

Do not restore on top of an already populated database. If restoration fails part-way, inspect the cause and use a new empty destination for the next attempt; do not keep applying the same dump on top of partial data. Keep the old backup unchanged until the new setup is checked.

Privately restore apps/api/.env and apps/storefront/.env. Update DATABASE_URL for the new database user/password/host/port. URL-encode reserved characters in the password component, such as @, :, # or %. Restore the local media directory. Absolute custom paths in .env must be updated for this computer.

Local settings should remain development/local, with the old applicable settings preserved:

| API setting | Typical local value |
|---|---|
| NODE_ENV | development |
| CORS_ORIGINS and EMAIL_SITE_URL | http://localhost:4321 |
| EMAIL_DRIVER | local |
| MEDIA_DRIVER | local |
| MEDIA_PUBLIC_URL | http://localhost:3001/media |
| ORDERS_MODE | test |
| RAZORPAY_MODE | disabled, unless already intentionally configured for test |
| DATABASE_SSL | disable for the usual local PostgreSQL listener |

Storefront PUBLIC_SITE_URL is http://localhost:4321; PUBLIC_API_URL and CATALOG_API_URL are http://localhost:3001. Do not replace an existing private email encryption key just to match local examples.

```powershell
Set-Location 'C:\Projects\jewellery-store'
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm.cmd run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration failed.' }
npm.cmd run dev
```

The migration runner checks existing migration checksums and applies only missing numbered migrations. **Do not run db:seed or admin:create on a restored database.** Your existing administrator account and password remain in the database. Use the documented admin:reset-password workflow only if you have forgotten the password.

### If you intentionally start with an empty development database

This is a separate path and loses access to your previous local records. Create the login/database as above but skip pg_restore. Copy .env.example files to actual .env only if you have no private configuration to restore, and set your database URL. Then run npm.cmd ci, npm.cmd run db:migrate, npm.cmd run db:seed and npm.cmd run admin:create, followed by npm.cmd run dev. The administrator password must be 12–128 characters. Seeding is for a new local development database; it is not the migration/restore procedure and is not production catalogue setup.

## 5. Check the restored system

Open http://localhost:4321/ after both server startup messages. Check the catalogue and product images; sign in at /admin/ with the existing administrator; compare products, stock and previous orders against the old system. Check /account/, /orders/, checkout and Admin → Emails / Returns & refunds.

```powershell
Invoke-RestMethod 'http://localhost:3001/health'
Invoke-RestMethod 'http://localhost:3001/ready'
```

Confirm the restored migration list if required:

```powershell
& "$pgBin\psql.exe" --host=localhost --port=5432 --username=store --dbname=jewellery -W -c 'SELECT name FROM schema_migrations ORDER BY name;'
```

It should contain migrations 001–005 from database/migrations. The API readiness response alone does not prove orders/images were restored; inspect them through the dashboard.

Customer accounts/orders are in PostgreSQL. Guests' saved order shortcuts, carts and wishlists are browser-local and **do not automatically move** with this ZIP/database. Save private order access codes from the old My Orders page and reopen them on the new browser if needed. A verified customer account can access matching linked orders across devices. Sign in again on the new browser; do not export session cookies. Local email previews can be accessed by an admin writer; fresh verification/reset links can be requested if old links have expired.

For automated checks, stop dev first so port 3001 is available:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run verify:build
```

verify:build uses a disposable PGlite database and tests the build; it does not build a release against your real restored catalogue. A real storefront build requires the intended API running and CATALOG_API_URL pointing to it.

## 6. Context the new chat must preserve

- Do not use the brand name in chat. Keep the jewellery-only Ivory & Antique Gold design, readable text, compact customer-review cards and moving offers with pause/reduced-motion support.
- Visual references: Voylla overall structure/reviews; Salty product-list/filter presentation; Anna + Nina inspired section adapted to jewellery only; My Jewellery footer structure. Source already implements the agreed design. Do not restart design or logo work.
- Budget-conscious architecture: static Astro + React storefront on Cloudflare Pages; Node 24/Fastify API on Railway; Drizzle/PostgreSQL on Railway; images on Cloudflare R2. Durable background work runs in the API process using PostgreSQL. No Redis or separate worker deployment.
- User uses Windows PowerShell. Prefer npm.cmd. The original working path was C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store; the new path may differ.
- Local admin, catalogue, orders and latest accounts/email/returns setup were reported working. Razorpay credentials were deferred. Do not assume GitHub/Railway/Cloudflare/Resend resources were created.

### Implemented scope

Catalogue/search/filter/sort/pagination/static product URLs; cart/wishlist; validated server quotes/offers/paise totals; admin authentication/roles/CSRF/audit/versioned product and inventory edits; local or R2 image uploads; idempotent guest COD and order management; private guest receipt codes/My Orders; test Razorpay sessions/callback/webhooks/reservations/reconciliation; accounts/verification/reset; verified-email guest-order linking; encrypted durable email outbox and local previews/Resend adapter; full-order return/cancellation review, explicit once-only inspected restocking, manual external COD refund recording and test Razorpay refund reconciliation.

Verification is required before an account claims matching unowned guest orders. Return approval does not automatically refund or restock. A manual COD refund records a staff-confirmed external payment; it does not transfer money. Uncertain gateway creates/refunds must be reconciled; do not issue another provider POST blindly. Captured-after-cancelled, refund discrepancies and authorized-only payments have fulfilment guards. Account passwords/sessions/tokens are hashed; email bodies encrypted. Never expose guest proof or secrets in URLs/logs/frontend bundles.

### Code map

| Area | Main location |
|---|---|
| API/env/bootstrap/jobs | apps/api/src/app.ts, server.ts, env.ts |
| Catalogue/quote/DB schema | catalogue.ts, quote.ts, schema.ts, db.ts |
| Admin and uploads | admin-routes.ts, admin-repository.ts, admin-cli.ts, media.ts |
| Orders and guest access | orders.ts, order-routes.ts |
| Gateway/payment safeguards | payments.ts, payment-routes.ts, razorpay.ts |
| Accounts/security/email | customers.ts, customer-routes.ts, password.ts, email.ts |
| Return/refund state machine | returns.ts |
| Frontend pages/theme | apps/storefront/src/pages, src/styles/global.css |
| Interactive components | apps/storefront/src/components |
| Client state/API helpers | apps/storefront/src/lib |
| Shared schemas/totals/offers | packages/contracts/src/index.ts |
| Applied migrations | database/migrations/001_catalogue.sql through 005_accounts_returns.sql |
| Tests | apps/api/test, apps/storefront/test |
| Hosting | Dockerfile.api, railway.json, README.md |

Never edit applied migrations 001–005. Add a numbered migration and update typed mappings for schema changes. Preserve schema_migrations and inventory/order/payment idempotency history during a move. Reconcile payments before fulfilment; do not treat a browser callback as proof of capture.

### Verification already completed, and its limits

The last development milestone passed 82 tests (71 API/database, 11 storefront/state/UI), API type checking and a production-style build of 21 pages; generated asset/link checks passed. Migration preservation tests confirmed existing orders/admin/inventory survive the updates. These are historical results, not checks rerun by this handover.

Database tests use single-connection PGlite, not networked PostgreSQL contention. UI tests use Happy DOM, not a full browser. Windows, real email delivery, Razorpay transactions/refunds, hosted cookies, R2, Railway and Cloudflare still require checks in the user's environment. See VALIDATION.md for the full record.

Remaining work includes test deployment, actual provider verification, owned/licensed product assets, real catalogue/policies/serviceability/tax decisions, backup/restore verification and explicit later live-payment development. Online checkout/refunds currently accept **test keys only**. Partial refunds, automated courier pickup/fulfilment, tax invoices/credit notes, automated COD bank payouts, email bounce/delivery monitoring, account email changes and database-managed promotion scheduling are not implemented. Sample reference assets, portraits, business claims and placeholder content must be replaced/reviewed before publication.

## 7. Exact next milestone: hosted test environment

1. Verify the move locally. Put secret-free source in a private GitHub repository.
2. Create Railway PostgreSQL and API services. Use monorepo root, railway.json/Dockerfile.api, compiled migration predeploy and /ready health check. Set backend environment through Railway. Decide explicitly whether hosted testing uses a fresh dataset or approved imported data.
3. Configure Cloudflare R2 uploads before using production image upload; local production uploads are blocked. Existing local image URLs/files need an explicit R2 migration; uploading the source alone does not move them.
4. Configure Resend sender/domain and a private email encryption key. Production rejects EMAIL_DRIVER=local; EMAIL_DRIVER=disabled can allow infrastructure testing but disables registration/reset/resend. Preserve encryption for any imported queued payloads.
5. Build Cloudflare Pages from the repository root: npm run build -w @store/storefront; output apps/storefront/dist; Node 24; public site/API/catalogue environment; ALLOW_SAMPLE_CATALOG=false. The deployed catalogue API must work before the build. New product URLs/content need a rebuild; checkout stock/totals are fetched live.
6. Prefer shop.example.com and api.example.com on the same HTTPS parent domain. Exact CORS_ORIGINS and EMAIL_SITE_URL must match the storefront. Unrelated pages.dev/railway domains require configured Secure SameSite=None customer/admin cookies and may still be blocked by browser third-party-cookie policies. Test actual browsers; never disable authentication/CSRF to bypass this.
7. Keep ORDERS_MODE=test and RAZORPAY_MODE=disabled initially. Add the user's test credentials later, including the public signed webhook at /api/v1/payments/razorpay/webhook. Live payment enablement is a separate code/configuration milestone.
8. Verify registration/mailbox verification/reset, cross-device ownership, guest receipts, stock/cancellations, returns, real sender acceptance/delivery, checkout retry/capture/refund reconciliation and backup restoration before considering launch.

Frontend settings may contain PUBLIC_STORE_NAME, PUBLIC_SITE_URL, PUBLIC_API_URL, CATALOG_API_URL and ALLOW_SAMPLE_CATALOG. Database/email/storage/payment credentials belong on the API only. Current deployment files exist but have not been exercised on hosted accounts. The next agent should check current official provider documentation when preparing actual deployment; this handover records repository behavior, not a promise about future service plans/prices.

## 8. Start the new ChatGPT Work chat

Attach only the secret-free source ZIP. Paste RESUME-PROMPT.txt and fill in your new local path, whether the database was restored, and cloud setup status. The new profile should read this guide before editing. If tools cannot open a ZIP, extract and attach this guide plus the source through the profile's supported workspace workflow.

Your database/.env/media backups stay on your machines. Tell the new chat that restoration is complete or describe errors with credentials redacted. Keep the old working system and backup until the new system has passed checks. This guide plus the source removes the need to rely on memory from the old chat.
