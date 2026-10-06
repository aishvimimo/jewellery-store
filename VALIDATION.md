# Validation — accounts, email and full-order returns milestone

Completed on 2026-10-06.

- 82 automated tests passed: 71 API/database tests and 11 storefront/state/UI tests.
- The checkout UI submitted a COD order against the actual Fastify routes and PostgreSQL repository. A simulated lost HTTP response was followed by a component reload and retry: one order was persisted, stock was consumed once, the cart was cleared and the wishlist retained.
- The admin order UI then cancelled that order and stock was restored.
- Order API checks cover calculated snapshots, retry identity/conflicts, tampered totals/payment modes, duplicate items, insufficient stock rollback, coupons/shipping/gift-wrap, private receipt secrets, legal/illegal transitions, COD collection, tracking, edit conflicts, cancellation once, sessions/roles/CSRF, origin, PIN coverage, disabled checkout, filters/pagination and rate limits.
- An admin product editor opened before checkout cannot overwrite stock consumed by that order.
- Migration 003 was applied to a version-2 catalogue with an existing admin account and stock history; prices, stock, account credentials and historical movements were preserved. Migrations 001 and 002 remain byte-for-byte unchanged.
- Migration 004 was applied to a version-3 database; existing COD orders, administrator credentials and inventory were preserved. Migrations 001–003 remain byte-for-byte unchanged.
- Payment API tests cover private receipt access, origin, callback HMAC, provider order/amount/currency matching, captured versus authorized payments, raw-body webhook signatures, previous secrets, duplicate/out-of-order events, unrelated null-order events, ambiguous provider-order creation recovery, expiry/release, provider outages, late captures, refunds, reconciliation and admin permissions.
- The online checkout UI exercised failure/dismissal/retry, authorized-only callback, capture reconciliation, cart clearing after verification and receipt reload without clearing later cart additions. A provider stub and mocked hosted checkout constructor were used; these are not real provider transactions.
- Customer account checks cover hashed credentials/sessions, HTTP-only cookies, Origin/CSRF, verification-only order linking, cross-account denial, duplicate registration, generic reset responses, one-use/expired/purpose-bound tokens, password changes, session revocation and login lockout.
- Email checks cover encrypted queued tokens, durable event deduplication, order snapshots, dispatch tracking, local admin writer-only previews, provider identity across retries, accepted-payload deletion and holding ambiguous sends outside the safe retry window.
- Return/refund checks cover guest proof, verified account ownership, one active case, request retries, approval/receipt/close transitions, return-window limits, staff authorization, stale versions, full-amount provider validation, pending/failed/uncertain refunds and matching external refund adoption.
- Inventory checks cover explicit one-time inspection/restock, no automatic stock return on refund, ordinary COD cancellation after restocking, and late COD collection updating the refund amount and invalidating stale reviews.
- A Happy DOM integration flow registered and signed in, opened an admin email preview, verified/linked a pre-existing guest order, submitted cancellation, approved/closed it in admin, reopened the customer receipt, signed out and reset the password using the queued email link. It then signed in with the new password.
- Migration 005 preserved existing administrators, COD order snapshots, payment-session identifiers and inventory; account links started unset. Migrations 001–004 remain byte-for-byte unchanged.
- Existing catalogue, quote, cart, wishlist, admin sign-in, product editor and image validation checks still pass.
- Full production compilation succeeded with sample fallback disabled: 21 generated pages, including checkout, admin and saved-product preview.
- TypeScript/Astro compilation passed with no errors, warnings or hints.
- Customer order detail checks verify secret/Origin requirements, no-store responses, tracking/status history and exclusion of customer addresses, staff notes/names and provider identifiers.
- The checkout/admin integration test also opened My Orders, reloaded after clearing checkout session data, viewed cancellation history, removed local access without changing the order, rejected a wrong code, reopened with a correct code and preserved another device’s cart.
- Browser history checks cover bounded retention, validated private codes, safe metadata projection and malformed entries.
- My Orders and My Account are noindex, excluded from the sitemap and contains no private receipt data in generated static HTML.
- Generated local links and image/script/style assets were checked.

Environment limits:

- Database integration uses PGlite, an embedded PostgreSQL engine on a single connection, not a networked PostgreSQL TCP service. Actual `pg` driver integration and multi-connection contention require validation against local/deployed PostgreSQL.
- Happy DOM verifies state/DOM flows. No Chromium browser was available for screenshots, real-browser layout or cookie-policy checks.
- Windows PowerShell is unavailable here; the updater and interactive password entry require verification on your Windows machine.
- Docker/Railway/Cloudflare resources were not provisioned or deployed. R2 uploads and optional Pages deploy hooks still need account configuration and live checks.
- Online payments are disabled by default and support Razorpay test keys only when enabled. No Razorpay account, real hosted checkout, transaction or public webhook was accessed. The provider adapter and actual HTTP/API account behavior require verification with your own test credentials.
- Local emails are protected development previews; no real email, Resend account, real delivery/bounce webhook or Razorpay refund was accessed. Provider send/refund behavior was simulated by adapters. Verify with your own sender domain, credentials and test gateway.
- Online refund initiation is test-only. Returns/refunds cover the full order. COD refund confirmation records an external staff-confirmed payment reference; it does not execute a payout. Partial refunds, courier pickup, invoice/credit-note generation and real bank payouts are not included.
- Email payload encryption uses a development fallback locally. Production rejects local previews and requires a private key plus configured HTTPS/domain/cookie settings. Real cookie restrictions and multi-replica queue/finance contention require deployment tests.
- Live COD mode still requires explicit settings and verified delivery coverage/business rules.

## Resume verification — 6 October 2026

- Node 24.19.0 / npm 11.9.0; lockfile installation completed.
- All 71 API tests passed. Initial concurrent storefront run had two file-process failures without diagnostic detail; sequential rerun passed all 11 storefront tests (82 total across successful runs). The failure cause has not been established.
- npm run typecheck passed. npm run verify:build passed, generating 21 pages with sample fallback disabled against the disposable test API.
- scripts/verify-build.mjs now uses npm_execpath with Node to avoid the Windows command-wrapper launch problem. Node syntax checking passed; actual Windows execution remains unverified.
- Applied migrations 001–005 were compared byte-for-byte with the supplied archive and are unchanged.
- Supplied backup header reports PostgreSQL/pg_dump 18.6, custom archive 1.16.0. This is header inspection only: pg_restore integrity checking and real restoration remain unverified because PostgreSQL tools/server are unavailable here.
- Added read-only Windows restoration checks and hosted-test environment checklists. PowerShell, actual .env/media restoration, real browsers and provider deployment were not verified. No cloud resources or live payments were enabled.
