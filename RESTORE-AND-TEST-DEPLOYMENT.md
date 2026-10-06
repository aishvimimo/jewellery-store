# Resume status — 6 October 2026

Read this before the older handover examples. The supplied custom-format database archive header identifies PostgreSQL **18.6** and pg_dump **18.6**, archive format 1.16.0. Use PostgreSQL 18 and PostgreSQL 18 pg_restore for this move; the older PostgreSQL 17 commands are examples for a different source version. Header inspection does not prove archive integrity or successful restoration.

## Restore on Windows

1. Install Node 24 with npm 11+, PostgreSQL 18 server/tools and Git. Extract this source to a new directory, for example C:\Projects\jewellery-store. Work in the folder containing package.json.
2. Follow PROJECT-HANDOVER.md sections 4–5 with `$pgBin = 'C:\Program Files\PostgreSQL\18\bin'`. First run `pg_restore.exe --list` against your private backup. Create an empty database/login; restore with `--no-owner --no-acl --exit-on-error` before migrations. Use interactive password prompts. A failed partial restore requires a fresh empty destination before retrying. Do not seed or create another admin.
3. Privately copy your existing API/storefront .env files and uploaded media from the old computer. Preserve the email encryption key. Update DATABASE_URL for the new local database. Keep ORDERS_MODE=test and RAZORPAY_MODE=disabled. The attached source does not contain the private .env files or uploaded media.
4. Run `npm.cmd ci`, then `npm.cmd run db:migrate`, then `npm.cmd run dev`. Open http://localhost:4321/admin/ and use your existing admin account. Compare products, stock, old orders and images with the previous system.
5. In a second PowerShell window, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Verify-Restoration.ps1`. Override its database/tool/API parameters if needed. This script prompts for the database password, reads migration checksums and aggregate counts, and checks /health and /ready. It makes no database changes. Counts and readiness are supporting checks; they do not establish full data/image restoration.
6. Stop dev before running `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run verify:build`. The build verification uses a disposable sample database, never the restored dataset.

The build verification now invokes npm's JavaScript entry point with Node rather than spawning its command wrapper, to support Windows. Windows execution still requires local verification.

## Reviewable hosted test configuration

Preserve the current Astro/React, Railway API/PostgreSQL, Cloudflare Pages/R2 architecture. No extra worker or Redis service is needed. No cloud resources were created by this package.

1. Complete Windows restoration first. Put source only in a private GitHub repository. Exclude actual .env files, .data, dumps, backups and node_modules. Choose explicitly between a fresh hosted dataset and an approved database import. Do not import this attached backup by default. Provision PostgreSQL 18 for an imported dataset unless a separately validated migration plan is agreed; check the hosted database version before restoring.
2. Railway: repository root and Dockerfile.api. Current official documentation marks railway.json/config-as-code deprecated, with existing files supported for legacy services until 2026-12-01. For a new service, explicitly configure Dockerfile.api, start command `npm run start -w @store/api`, pre-deploy command `npm run db:migrate:production -w @store/api` and /ready health check in the service dashboard, or use the documented Infrastructure as Code migration. Do not assume the legacy file is applied; inspect deployment settings. The existing file is preserved for compatibility. Configure private backend settings using deployment/railway.env.example as a checklist. Placeholders are not runnable credentials. Use the database service's actual required TLS setting. Confirm trusted-proxy behavior before changing TRUST_PROXY. Check /ready and catalogue routes before Pages builds.
3. R2: create a product-image bucket and public custom image domain; scope the private API token to the intended bucket. Configure R2 values only on Railway. Explicitly transfer old local uploads and update stored URLs after successful uploads; neither the source nor the database archive transfers image bytes. Do not use local production uploads. Use a custom domain for hosted assets rather than the development r2.dev endpoint.
4. Resend: verify an owned sender domain with the provider-supplied DNS records, configure EMAIL_FROM and private API key on Railway. EMAIL_DRIVER=disabled is suitable only for infrastructure checks; registration/reset/resend remain disabled. Preserve the old encryption key for imported queued messages. Resolve development-key migration using ACCOUNTS-EMAILS-RETURNS-UPDATE.md before selecting a new production key.
5. Pages: connect the private repository with monorepo root; use `npm ci --no-audit --no-fund && npm run build -w @store/storefront` as build command and `apps/storefront/dist` as output. Set the public variables in deployment/pages.env.example, including NODE_VERSION=24 and SKIP_DEPENDENCY_INSTALL=1. This ensures installation uses the lockfile. Use actual HTTPS origins. API/database/provider secrets never belong here. ALLOW_SAMPLE_CATALOG=false; build only after the intended catalogue API is ready.
6. Prefer shop/api subdomains under the same HTTPS parent domain. CORS_ORIGINS and EMAIL_SITE_URL must match the exact storefront origin. Keep both cookie SameSite settings lax for this arrangement. Unrelated provider domains need production Secure SameSite=None cookies and actual-browser checks; third-party-cookie policies can still block them. Do not bypass CSRF/authentication.
7. Keep ORDERS_MODE=test and RAZORPAY_MODE=disabled. Later configure only Razorpay test credentials and the signed webhook after a separate test-payment review. No live-payment enablement is included.
8. Before calling the environment verified, test hosted registration, mailbox verification/reset, account and admin sessions in real browsers, cross-device order ownership, guest receipts, COD retries/cancellation/restock, returns, Resend acceptance and mailbox delivery, R2 upload/display, intended catalogue builds, PostgreSQL concurrency and a backup restore. Verify online checkout/refunds only after test credentials exist. Review sample content/assets and business policies before publication.

## Official references reviewed

- Railway config: https://docs.railway.com/config-as-code/reference
- Railway pre-deploy: https://docs.railway.com/deployments/pre-deploy-command
- Railway health checks: https://docs.railway.com/deployments/healthchecks
- Cloudflare Pages build image: https://developers.cloudflare.com/pages/configuration/build-image/
- Cloudflare Pages builds: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Cloudflare R2 public buckets: https://developers.cloudflare.com/r2/buckets/public-buckets/
- Resend domains: https://resend.com/docs/dashboard/domains/introduction

## Information needed to continue

Provide the new Windows project path, whether restoration has completed, and which GitHub/Railway/Cloudflare/Resend accounts, repository and domain are already set up. Do not send passwords, .env files, payment keys or private order codes. These details identify the actual deployment targets; this package has not deployed them.
