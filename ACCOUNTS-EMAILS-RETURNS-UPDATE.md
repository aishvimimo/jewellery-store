# Accounts, email and returns update

All three requested modules are included: customer registration/login/logout and password reset, verified guest-order linking, confirmation/dispatch/security emails, and full-order return/cancellation review with refund reconciliation.

The architecture remains Astro/React on Cloudflare Pages, Fastify on Railway, PostgreSQL on Railway and product images on Cloudflare R2. Background jobs run in the API process, with durable work in PostgreSQL. No Redis, extra worker service or new npm dependency is required.

## Update your existing Windows project

Stop the server with Ctrl+C. Extract this ZIP into a separate folder outside your working project. Open PowerShell in the newly extracted `jewellery-store` folder and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-Project.ps1 -ProjectPath "C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store"
```

`ProjectPath` is the **existing working project**. The updater preserves your `.env`, PostgreSQL data, uploads, orders and administrator account. Migration 005 adds account, email and return tables plus an optional order/customer relationship and refunded payment status. Migrations 001–004 are unchanged. Do not seed again or recreate the administrator.

```powershell
Set-Location "C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store"
npm.cmd run dev
```

Local defaults work without editing `.env` or configuring Razorpay. This assumes your existing API runs with development settings and the default localhost storefront origin. Custom storefront origins must match `EMAIL_SITE_URL` and `CORS_ORIGINS`.

## Customer accounts

Open http://localhost:4321/account/ or choose the account icon in the header.

1. Create an account with a password of 12–128 characters.
2. Sign in. Your account is initially unverified and cannot access linked orders.
3. In Admin → **Emails**, click **Process queued emails**, then **View preview** on the verification email.
4. Use **Open account link**, then click **Verify email**. Refresh/sign in to your account when needed.
5. Existing and new guest orders with exactly that verified checkout email become linked on verification or order-list refresh. Other accounts cannot access them. Orders already linked elsewhere are not reassigned.
6. Customers can sign in on another browser and see linked orders without exposing private guest receipt codes.
7. **Sign out** revokes that session. **Forgot password** queues a reset link. Open its preview, set a new password and sign in again. A successful reset revokes every previous customer session.

Registration and reset responses avoid disclosing whether an email already has an account. Verification links expire after 24 hours, reset links after 30 minutes; each is single-use. A newly issued link invalidates earlier links for that purpose. Requests are throttled, including a one-minute resend cooldown. Login failures lock the account temporarily after repeated incorrect passwords. There are no default customer credentials.

Verification proves control of the mailbox. Typing an email, providing an order number, or signing in to an unverified account does not link orders. Email changes and administrator reassignment of ownership are not included.

Guest My Orders at `/orders/` remains available. Its private code is an independent receipt credential; account linking does not revoke it. Full order receipt access omits addresses/contact data and internal staff notes. The account stores passwords and session/token hashes on the API; the frontend keeps neither passwords nor session tokens in local storage.

## Emails now included

- Order received / confirmation, with stored item/price snapshots and total.
- Confirmed, dispatched and other order status updates; dispatch includes manually entered tracking.
- Verification and password-reset links.
- Return/refund request updates and customer-facing review responses.

Test-order emails are labelled TEST and explain that no real payment or shipment occurs. Confirmation of a pending online order does not claim the payment was captured.

The queue is stored in PostgreSQL and survives API restarts. Order/return events are durable sources with unique message keys, so retries do not create another email for the same event. The migration establishes a starting timestamp for order notifications: it does not send all historical order events from before this update.

The API processes work on startup and about every 60 seconds while running. **Process queued emails** offers an immediate local check. Queue state **sent** means the email provider accepted the request; it does not prove inbox delivery. Bounce, complaint and delivery-event monitoring are not included.

Email bodies, including account links, are encrypted in the database. Account token hashes live in separate token records. Provider-accepted bodies are deleted; local previews are removed after seven days. Expired security messages are not sent. Resend retries use a stable idempotency key; uncertainty older than 23 hours is held for review rather than sent again outside the documented deduplication window. Do not automatically retry or recreate review-held messages: inspect the provider first.

### Local email mode

`EMAIL_DRIVER=local` is the development default. It does not contact an email service. Full previews are available only to administrator writers in local development. This allows you to test verification and reset without a sender domain or credentials. Previewing account links is unsuitable for a real production store, and production rejects local mode.

The fixed fallback encryption key is for development only. Production requires your own private key. Preserve the encryption key across updates; changing it while messages are queued makes those payloads unreadable. When moving from the development fallback to your production key, first process all local queued messages into previews and stop new local submissions, then configure the private production key. Development previews are not later sent through Resend.

### Real email delivery later

Use your own Resend account, API key and verified sender domain. Configure these **only on Railway/the API**:

```dotenv
NODE_ENV=production
EMAIL_DRIVER=resend
EMAIL_SITE_URL=https://shop.example.com
EMAIL_FROM=orders@example.com
RESEND_API_KEY=YOUR_PRIVATE_API_KEY
EMAIL_ENCRYPTION_KEY=YOUR_UNIQUE_64_CHARACTER_HEXADECIMAL_KEY
CUSTOMER_COOKIE_SAMESITE=lax
CUSTOMER_SESSION_HOURS=24
RETURN_WINDOW_DAYS=14
```

These are placeholders. `EMAIL_SITE_URL` must be the exact HTTPS storefront origin listed in `CORS_ORIGINS`. Generate a private encryption key locally in Windows PowerShell:

```powershell
$keyBytes = New-Object byte[] 32
$keyGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$keyGenerator.GetBytes($keyBytes)
$keyGenerator.Dispose()
-join ($keyBytes | ForEach-Object { $_.ToString("x2") })
```

Store that result privately as `EMAIL_ENCRYPTION_KEY`; do not paste credentials into chat, frontend configuration or Git. Keep sender/API key settings stable during uncertain retries so the same message request remains identical.

For production customer and admin sessions, use storefront/API custom subdomains under the same HTTPS parent domain when possible, such as `shop.example.com` and `api.example.com`. This works with SameSite=Lax. A Pages domain and unrelated Railway domain require Secure SameSite=None cookies and can still be blocked by browser third-party-cookie policies. Configure both customer and admin cookie settings for your actual domain arrangement and verify in a real browser. No domains or hosted resources were provisioned by this update.

`EMAIL_DRIVER=disabled` keeps queued order notifications but disables email-dependent registration/reset/resend operations. It is not a substitute for email configuration when launching customer accounts.

## Returns and cancellation requests

Customers open an order in My Account or guest My Orders and use **Returns & cancellation**.

- Pre-dispatch cancellation: available for unshipped COD orders and captured/reviewed online orders. Unpaid online reservations continue through the existing payment-expiry workflow.
- Returns: available after delivery, within `RETURN_WINDOW_DAYS` measured from the first recorded delivered event. The development default is 14 days; set it to your approved business policy before launch.
- Requests cover **the full order**, not selected items or partial quantities. Full paid refunds include the stored order total, including shipping/gift-wrap; unpaid COD cancellation has refund amount zero. Eligibility is reviewed by staff.
- Duplicate retries reuse an existing equivalent case; another active case cannot cover the same order. Rejected requests can be submitted again if still eligible.

In Admin → **Returns & refunds**:

1. **View request**, then **Approve** or **Reject**. Reject requires a customer-facing reason. Pending cancellation requests prevent dispatch until reviewed.
2. For an approved return, **Mark items received** after physically receiving all items.
3. Use **Restock inspected items** only if every item is suitable for resale. It changes inventory once and invalidates stale stock edits. Approval/receipt/refund do not automatically restock returns. Damaged/unusable returns can remain unstocked.
4. For an unpaid COD cancellation, **Close request** cancels the order and restores stock once. No payment transfer is performed.
5. For a collected COD return, pay the refund through your actual external process, then **Confirm external COD refund** with its reference. This records staff confirmation; it does not send money. For a TEST order, use a clearly labelled simulated reference.
6. For an online order, approve cancellation or receive the return, then **Initiate online test refund**. The API checks the original key/payment, captured amount, INR currency and prior refunds. Only a fully processed matching refund changes payment status to Refunded. Pending/failed/unknown results remain held for review.
7. **Check provider refund** fetches the saved refund or searches by its stable request receipt. A lost response never causes an automatic second refund POST. The initial POST also uses Razorpay's documented refund-idempotency header.
8. **Link existing provider refund** can reconcile a fully processed full refund issued externally. The API verifies its payment, currency and amount against the original test payment and current provider refunded amount; it does not issue another refund. This also resolves an uncertain/failed attempt once the actual external result is verified.
9. **Close request** only after required refund completion. Cancellation closing restores stock once; a delivered return closes without automatically restocking unusable items.

Paid/refunded orders cannot be fulfilled or marked collected again through the ordinary COD control. A late captured payment after stock release remains a review case; create/review its cancellation request and reconcile a matching full refund. Approved/received/refund-pending states, versions, inventory flags and provider IDs are durable. Staff write access, Origin and CSRF checks apply. A COD collection recorded after a return request updates its refund amount and invalidates stale review versions; closing an unpaid return prevents later ordinary cash-collection changes. Ordinary COD cancellation also respects stock already released through return review.

Online refund initiation remains **Razorpay test-only**, like the existing checkout. You can test accounts, local emails, COD cancellation and manual COD return recording now. Actual online refunds require your later test credentials. Live online payment/refund enablement, partial refunds, return pickup labels, customer uploads, credit notes/tax invoices and bank payout integration are not included. This update provides the implemented full-order workflow, not an automatic courier or payout service.

## Local checklist without Razorpay

1. Place a COD test order with an email you will register.
2. Register/sign in and confirm the order is hidden until email verification.
3. Open the verification preview in admin; verify and confirm that matching order appears.
4. Sign out and sign in again; verify cross-browser account access.
5. Request cancellation before dispatch. Approve and close it in admin; confirm Cancelled and a single stock return.
6. Place another COD test order. In admin, confirm, ship and mark delivered/collected. Submit a return, approve it and receive it.
7. Restock only if inspected/resalable. Record a simulated full COD refund reference, then close. Confirm Refunded and no repeated stock return.
8. Use Forgot password, open its email preview, reset and verify old sessions/password no longer work.
9. Check confirmation/dispatch/return email previews and manually entered tracking.

For online refund testing, configure test credentials per PAYMENTS-UPDATE.md. Verify processed, pending, failed, duplicate and uncertain responses with your own provider account before a live-payment milestone.

## Validation

Automated integration checks use actual Fastify routes and PGlite PostgreSQL queries, provider stubs and Happy DOM UI flows. Real email delivery, real Razorpay refunds, deployed Railway/PostgreSQL/Pages behavior, multi-connection contention, actual-browser cookie behavior and Windows PowerShell still require checks in your environment. No external emails or financial transactions were sent during development.

## Official provider references

- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend idempotency and its 24-hour window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Razorpay normal refund with idempotency](https://razorpay.com/docs/api/refunds/normal-refunds-idempotent)
- [Razorpay fetch refunds for a payment](https://razorpay.com/docs/api/refunds/fetch-multiple-refund-payment)
