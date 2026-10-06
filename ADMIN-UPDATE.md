# Admin panel update — Windows PowerShell

This update adds admin sign-in and catalogue management to your working local project. It works with your directly installed PostgreSQL; Docker is not required.

## Safest update procedure

1. Stop the current development server using **Ctrl+C** in its PowerShell window.
2. Extract the updated archive into a **different temporary folder**. Do not replace your existing `.env` files.
3. Open PowerShell inside the newly extracted `jewellery-store` folder.
4. Run the updater, pointing it at your existing working project:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-Project.ps1 -ProjectPath "C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store"
```

This bypass applies only to that one PowerShell process. It does not change the machine-wide execution policy.

The updater backs up matching existing source files under `.update-backups`, copies the updated code, preserves existing `.env` files and local uploaded media, installs dependencies, and applies the new migration. It does not seed/reset products or delete database records. If you have made your own code changes, compare them with the backup before continuing.

If your project is elsewhere, replace the ProjectPath argument with its actual path.

## Create your first admin account

Return to the existing project folder and run:

```powershell
Set-Location "C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store"
npm.cmd run admin:create
npm.cmd run dev
```

The account command asks for email, display name, password and password confirmation. The password is hidden while typing; use 12–128 characters. There is no default admin/password and no public registration endpoint.

Open **http://localhost:4321/admin/** and sign in using the account you just created. Use `localhost` for both storefront and API locally. Stop old dev servers so Astro can use port 4321; a different port needs the matching CORS origin in `apps/api/.env`.

Forgotten password:

```powershell
npm.cmd run admin:reset-password
```

This prompts for the account and a new hidden password, and revokes that account's existing sessions.

## Manual update alternative

If you prefer to copy files manually, copy the updated `apps`, `packages`, `database`, `scripts`, root package files and configuration into your working folder, retaining `.env` files. Then run:

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run admin:create
npm.cmd run dev
```

Do **not** run `db:seed` for this update. Migration 001 is unchanged; migration 002 adds admin tables, product edit versions and variant archival without resetting catalogue data.

## Admin features

- Email/password sign-in, HTTP-only server sessions, sign-out, account lockout after repeated failures.
- Product list, search, active/draft filter, pagination and low-stock summary.
- Create/edit product descriptions, immutable URL slugs, featured order and categories.
- Activate/deactivate products using the visibility checkbox.
- Manage variants, unique SKUs, selling/original prices, filter attributes and stock.
- Upload/reorder/remove image references, set the cover image, or add an image URL.
- Audit history and stock movements, plus edit-version conflict protection.
- Preview a saved active product from the editor.
- Optional Cloudflare Pages rebuild request.

An image or product is not saved until **Save product** completes. Uploading creates the image file first and adds its reference to your unsaved form. Removing a reference does not delete the underlying file, so existing links remain intact. Unused files can be cleaned up later.

Existing variant removal archives it; its SKU remains reserved. Product URL slugs cannot change after creation. To hide a product, turn off “Active in the public catalogue” and save.

New variants use unique SKUs. Original price is optional and cannot be below the selling price. Prices are entered in rupees; the API stores integer paise.

## Image storage

### Local development

No extra settings are necessary with the default API port. Uploads are stored in `apps/api/.data/media` and served from `http://localhost:3001/media/…`. Keep this directory when updating your project. If your API uses a different origin/port, set `MEDIA_PUBLIC_URL` accordingly in `apps/api/.env`.

Uploads accept JPEG, PNG, WebP or AVIF, up to 8 MB and 25 megapixels. The API checks the decoded format, removes metadata, and converts to WebP with a maximum 1600px dimension. SVG and non-image files are rejected.

### Railway deployment with R2

Local image uploads are disabled in production because Railway's container filesystem is not durable storage. Configure these **backend-only** variables:

```dotenv
MEDIA_DRIVER=r2
MEDIA_PUBLIC_URL=https://images.example.com
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET=your_product_image_bucket
```

Create a public product-image bucket with a public custom image domain. Keep customer/private documents elsewhere. New files are written under `products/` with random versioned filenames. R2 credentials should be scoped to the product bucket. Uploads pass through the authenticated API for validation/optimization, so browser-to-R2 upload CORS is not needed in this implementation.

You can still attach existing HTTPS product image URLs if uploads are not configured. Do not upload production images to ephemeral local disk.

## Authentication when deployed

Prefer storefront/admin on `www.example.com` and API on `api.example.com`, sharing the same parent domain. Set the exact frontend origin in CORS_ORIGINS. Sessions use secure, host-only cookies in production and SameSite=Lax by default.

A `pages.dev` storefront and `railway.app` API are different sites. Those default domains do not reliably support this cookie setup. `ADMIN_COOKIE_SAMESITE=none` is available for HTTPS production, but browsers can still block third-party cookies; matching custom domains are the recommended setup.

Session lifetime defaults to 8 hours. CSRF tokens stay in memory and authenticated state-changing routes require both an allowed Origin and a matching token. The API independently enforces admin permissions. Read-only viewer roles are supported in the database, but this milestone does not include user-management screens.

The Docker build includes a compiled account setup command. On Railway, run the interactive `npm run admin:create:production -w @store/api` inside the deployed container using a terminal that allocates a TTY. Run password reset with `admin:reset-password:production`. Do not put passwords in command arguments or commit them to Git.

## Publishing catalogue changes

Cart/checkout quotes always use current database values. Public catalogue requests can be cached for up to 60 seconds. Existing static product descriptions, SEO data and new product URLs require a successful Pages rebuild after deployment.

To enable the dashboard rebuild button, create a Cloudflare Pages deploy hook and put its URL in backend `PAGES_DEPLOY_HOOK_URL`. Keep this URL secret. The button requests a rebuild; it does not report completion. You can also rebuild in Cloudflare's dashboard. Batch content edits to stay within your build budget.

The “Preview saved product” link loads active product data through the API and works before static URLs are rebuilt. Drafts remain private to the admin editor. In local development, reload product routes after edits; the server resolves static paths from the current catalogue.

This guide covers the admin catalogue milestone. The archive now also includes guest COD orders; existing users should follow ORDERS-UPDATE.md for the latest update. Online payments, customer accounts and automatic fulfilment remain future integrations.
