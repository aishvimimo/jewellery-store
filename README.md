# Jewellery storefront starter

A local-first commerce foundation using Astro + React, Fastify, Drizzle and PostgreSQL. The storefront exports static files for Cloudflare Pages. The API container and PostgreSQL run on Railway.

## Latest update

Customer accounts, verified guest-order linking, confirmation/dispatch/reset emails and full-order return/refund review are now included. Existing Windows users: follow **[ACCOUNTS-EMAILS-RETURNS-UPDATE.md](ACCOUNTS-EMAILS-RETURNS-UPDATE.md)**. The updater preserves `.env`, database and admin accounts; local email previews and COD workflows require no provider credentials.

## What works

- Approved Ivory & Antique Gold palette, responsive jewellery-only layout, moving offers with pause and reduced-motion support.
- Homepage, catalogue, static product URLs, product details, search, category/colour/material/gender/price filters, sorting and pagination.
- Device-local guest cart and wishlist, quantity controls and save-for-later.
- Server-calculated checkout quotes using database prices and current inventory.
- Offer validation, gift-wrap and shipping estimates, integer-paise calculations, quote expiry and automatic refresh.
- Request validation, explicit CORS origins, security headers, rate limits, database constraints, migrations and idempotent sample seed.
- Product metadata, canonical URLs, product structured data, sitemap and custom 404.
- Admin sign-in, HTTP-only sessions, CSRF/origin checks, role enforcement, product/category/variant editing, draft visibility, stock audit and version conflict protection.
- Local image uploads and optional production R2 uploads, with validation, metadata removal and WebP optimization.
- Guest COD orders with idempotent retries, immutable snapshots, transactional inventory and secret-protected receipts.
- Admin order search/filtering, status transitions, COD cancellation, tracking details and manually verified COD collection.
- Razorpay hosted test checkout, signed callback/raw webhook verification, idempotent gateway sessions and PostgreSQL-backed reconciliation.
- Customer registration/login/logout, hashed sessions, CSRF, email verification and expiring single-use password reset.
- Verified account order history across devices, encrypted email outbox and protected local previews or configurable Resend delivery.
- Full-order return/cancellation requests, admin review, once-only inspected restock, manual COD refund recording and test Razorpay refund reconciliation.
- My Orders with browser-saved guest receipts, private access-code reopening, safe status history and manually entered tracking.
- Online reservation expiry, late-capture/refund review flags and fulfilment guards. Online payments remain disabled until test credentials are configured.

## Scope

The starter includes the catalogue, cart, admin catalogue management, guest COD order creation and admin order management. Checkout defaults to test mode. Order creation transactionally reduces available stock; cancelling an unshipped order restores it once. Online test payments are included behind explicit backend configuration. Live online payments, refund/review resolution, partial refunds, automatic courier fulfilment, return pickup and tax invoicing remain future integrations. See ORDERS-UPDATE.md for configuration and limits.

Sample product imagery and campaign assets were extracted from the previously approved design references. Some imagery contains reference branding. Replace it with your own licensed assets and verified descriptions before publication. Review portraits are explicitly marked as placeholders. The sample collection contains 10 products; some navigation categories intentionally have no products yet.

## Requirements

- Node.js 24 and npm 11 or later.
- Docker with Docker Compose, or an existing PostgreSQL database.
- PostgreSQL 17 is pinned for local development. Other supported versions require your own validation.

## Start locally

Run from the extracted `jewellery-store` directory:

```bash
npm ci
cp apps/api/.env.example apps/api/.env
cp apps/storefront/.env.example apps/storefront/.env

docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

Windows: copy the example files in your editor or use PowerShell `Copy-Item` instead of `cp`.

Create your admin account using `npm run admin:create`, then open http://localhost:4321/admin/ to sign in.

If you use directly installed PostgreSQL on Windows, skip the Docker step and point DATABASE_URL in apps/api/.env at your database. Use `npm.cmd` commands in PowerShell.

Open http://localhost:4321. API health: http://localhost:3001/health. Database readiness: http://localhost:3001/ready.

The API reads `apps/api/.env`; Astro reads `apps/storefront/.env`. The frontend may start before the API during `npm run dev`; wait for both startup messages before opening the homepage. If PostgreSQL already occupies port 5432, change the Compose port and DATABASE_URL together.

The local database password in the example is for local development only. Do not reuse it in production. `docker compose down` preserves the named volume; adding `-v` deletes the local database.

## First things to edit

1. Set `PUBLIC_STORE_NAME` in the storefront environment.
2. Replace sample images and product descriptions.
3. Adjust theme tokens in `apps/storefront/src/styles/global.css`.
4. Review promotion/shipping constants in `packages/contracts/src/index.ts`.
5. Replace help/footer placeholders with your business information.

To edit seed products during development, change `database/seeds.json` before the first seed. Rerunning the seed does not overwrite existing products or reset stock. Use the admin editor for existing products, images, prices and stock.

## Project structure

```text
apps/api/src/          API, repository, quote logic, database connection
apps/api/test/         PostgreSQL-backed API integration tests
apps/storefront/src/   Astro pages, React shopping components, shared theme
apps/storefront/public/assets/   Extracted sample reference assets
packages/contracts/   Zod schemas, DTOs, currency helper and offer constants
database/migrations/  Authoritative versioned SQL migrations
database/seeds.json   Development-only sample catalogue
Dockerfile.api        Railway API image
railway.json          Build, migration, health check and restart settings
```

SQL migration files are authoritative. Drizzle table definitions map them for typed queries. Do not modify an applied migration: the runner verifies its checksum. Add a new numbered SQL migration and update the Drizzle mapping together.

## API

| Endpoint | Purpose |
|---|---|
| `GET /health` | Process liveness |
| `GET /ready` | Database readiness |
| `GET /api/v1/products` | Paginated catalogue |
| `GET /api/v1/products/:slug` | Product and variants |
| `GET /api/v1/categories` | Active product categories |
| `GET /api/v1/facets` | Category and attribute options |
| `GET /api/v1/promotions` | Sample configured offer rules |
| `POST /api/v1/checkout/quote` | Validated current totals |
| `GET /api/v1/checkout/config` | COD mode and PIN coverage |
| `POST /api/v1/orders` | Idempotent order creation |
| `POST /api/v1/orders/receipt` | Secret-protected receipt |
| `GET /api/v1/admin/orders` | Protected order list |
| `GET /api/v1/admin/orders/:id` | Private order detail |
| `PUT /api/v1/admin/orders/:id` | Protected status/tracking update |

Product queries: `q`, `category`, `colour`, `material`, `gender`, `minPrice`, `maxPrice`, `sort`, `page`, `limit`. API price bounds are integer paise; the UI converts rupee input to paise. Sort values: `featured`, `name`, `price-asc`, `price-desc`. Default page size 12; maximum 48.

Example quote:

```bash
curl http://localhost:3001/api/v1/checkout/quote \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"variantId":"variant-1","quantity":2}],"coupon":"FESTIVE225","prepaid":true,"giftWrap":false,"delivery":"standard"}'
```

Only variant IDs and quantities are accepted as cart items. Client-submitted prices and duplicate variants are rejected. Missing/inactive items and insufficient stock return 409; invalid offer eligibility returns 422; invalid request fields return 400. Quotes expire after 60 seconds and never consume inventory.

## Sample pricing rules

- FESTIVE225: ₹225 off from ₹1,500 merchandise subtotal.
- WELCOME10: 10% off merchandise; does not stack with prepaid savings.
- Prepaid: 5% off merchandise after an eligible coupon, rounded down to paise.
- Standard shipping estimate: ₹79, waived at ₹1,499 merchandise subtotal before discounts.
- Express: ₹99 extra. Gift wrapping: ₹49.
- Test-mode PIN validation checks format only. Live COD checkout requires a configured, verified PIN-prefix allowlist; there is no automatic courier serviceability API.
- No separate tax calculation is implemented. Configure verified inclusive/exclusive tax treatment and invoicing before accepting orders.

The current promotions are code configuration, shared by frontend/backend. Database-managed offer scheduling remains a future integration. COD orders never apply the prepaid discount. The cart UI limits each variant to 20 and the cart to 50 distinct variants. Server stock validation remains authoritative.

## Checks and builds

```bash
npm test
npm run typecheck
npm run build
npm run preview -w @store/storefront
```

Keep the API running for `npm run build`: product URLs are generated from the catalogue API. A failed catalogue fetch fails the build rather than silently publishing sample products.

`npm run verify:build` starts a disposable PostgreSQL-WASM API and builds all pages against it, then shuts it down. It is for CI/build verification, not production. Do not run it while another API is occupying port 3001.

Tests use PGlite, an embedded PostgreSQL engine, to execute the actual migration SQL, Drizzle queries and constraints. They do not need Docker. This does not replace testing the networked `pg` driver and deployed environment.

Optional offline design build: set `ALLOW_SAMPLE_CATALOG=true` in the storefront `.env`. It adds an offline-preview banner and noindex metadata. Live controls still require the API. Never use this setting for production.

## Cloudflare Pages

Connect the repository with its root at the monorepo root, and configure:

| Setting | Value |
|---|---|
| Build command | `npm run build -w @store/storefront` |
| Output directory | `apps/storefront/dist` |
| Node version | `24` |
| `PUBLIC_SITE_URL` | Your HTTPS storefront origin |
| `PUBLIC_API_URL` | Your HTTPS Railway API origin |
| `CATALOG_API_URL` | Same public API origin for build-time fetching |
| `PUBLIC_STORE_NAME` | Your chosen display name |
| `ALLOW_SAMPLE_CATALOG` | `false` |

Pages serves static output; no Cloudflare runtime adapter or Pages Functions are required. Do not put DATABASE_URL or payment/storage credentials in frontend settings. Use the committed package-lock.json for reproducible installs.

The deployed catalogue must exist before the first Pages build. New product URLs and descriptive edits require a rebuild. Prices/stock used at checkout are fetched live. Batch catalogue-content rebuilds; do not rebuild for every stock change. Homepage reference banners, reviews and footer content are currently source-controlled, not editable through an API.

## Railway API and PostgreSQL

1. Create a Railway project and PostgreSQL service. Keep API/database in the same region.
2. Add an API service from the repository, with repository root as its root directory. `railway.json` points to `Dockerfile.api`.
3. Set `DATABASE_URL` to the PostgreSQL service's private connection URL/reference, `NODE_ENV=production`, `HOST=0.0.0.0`, and `DB_POOL_MAX=5`. Railway supplies PORT.
4. Set `CORS_ORIGINS` to the exact storefront origin (no trailing slash). Multiple origins are comma-separated. Include only specific preview origins you intend to support.
5. For Railway's internal connection, use the database service's required TLS configuration. `DATABASE_SSL=disable` suits a non-TLS private PostgreSQL listener; `require` enables certificate-verified TLS. Never use a blanket `rejectUnauthorized:false` override.
6. Pre-deploy automatically runs `npm run db:migrate:production -w @store/api` in the built image. It needs database access. The image contains migration files and the compiled runner.
7. Configure the API public domain. Verify `/ready` and catalogue routes before building Pages.
8. Populate your real products. The sample seed is blocked when NODE_ENV is production unless explicitly overridden. No public catalogue-write endpoint exists. Bootstrap an admin account and use the protected dashboard. See ADMIN-UPDATE.md for deployed account setup.

TRUST_PROXY defaults to false. For correct per-customer rate limiting behind Railway, configure trusted proxy behavior after confirming the request chain; do not blindly trust arbitrary forwarded headers. CORS is browser policy, not authorization. Admin writes enforce authentication, roles and CSRF; guest order writes enforce allowed origins and use rate limits and idempotency.

The Dockerfile runs as an unprivileged user. There is no public database port required for the storefront. Take database backups before schema changes, enable Railway scheduled backups and test restoration. No backups or cloud resources are provisioned automatically by this code.

## Cloudflare R2

The starter bundles extracted sample images as Pages assets, so local development requires no R2 account. For your real catalogue, upload optimized image variants to a public R2 bucket/custom asset domain and replace `product_images.url` with their absolute HTTPS URLs. Images then load directly from R2, not through Railway.

Authenticated image uploads and processing are implemented; see ADMIN-UPDATE.md for R2 settings. A private document bucket and backup exports remain future integrations. Keep those credentials on the API, and never make customer documents publicly readable. Use hashed/versioned image filenames to make long cache lifetimes safe.

## Next milestone

The requested accounts, email and full-order return/refund modules are implemented. Next configure your real sender and Razorpay test credentials, verify hosted cookie/payment behavior, then prepare explicit live-payment and fulfilment settings. See ACCOUNTS-EMAILS-RETURNS-UPDATE.md for local checks and production configuration.

## Validation record

See `VALIDATION.md` for checks completed and environment limitations.

## Official references

- https://docs.astro.build/en/guides/integrations-guide/react/
- https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/
- https://docs.railway.com/config-as-code/reference
- https://orm.drizzle.team/docs/get-started/postgresql-new
- https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
