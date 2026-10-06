# Online payments update — Razorpay test integration

The newer ACCOUNTS-EMAILS-RETURNS-UPDATE.md adds approved full-order test refunds and refund reconciliation. This guide covers checkout setup.

The architecture stays unchanged: Astro/React static files on Cloudflare Pages, Fastify API and PostgreSQL on Railway, and catalogue images on Cloudflare R2. Razorpay handles its hosted payment UI and payment processing; your Railway API verifies payment results. No Redis or additional worker service is required for this test milestone.

Razorpay is the working default because a provider was not selected. The adapter is isolated in `apps/api/src/razorpay.ts` so another provider can be integrated separately. This update supports **test keys only**; online live payments are intentionally unavailable until a live integration and business workflow review are complete. Existing COD checkout remains unchanged when payments are disabled.

## Windows update

Stop the running server with Ctrl+C. Extract the ZIP into a **different temporary folder** and open PowerShell in the newly extracted `jewellery-store` folder. Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-Project.ps1 -ProjectPath "C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store"
```

`-ProjectPath` is your **old working project**, not the newly extracted folder. The updater installs dependencies and applies migration `004_payments.sql`; it preserves your `.env`, catalogue, existing orders, stock, uploads and admin accounts. Migrations 001–003 are unchanged. Do not reseed products or recreate the admin account.

```powershell
Set-Location "C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store"
npm.cmd run dev
```

The application works immediately with COD. Online test payment becomes available after the backend settings below are configured.

## Enable online test payment

In your own Razorpay dashboard, switch to test mode and obtain a **test Key ID and Key Secret**. Do not paste secrets into chat, the frontend environment, Cloudflare Pages settings or Git.

Edit your **working** `apps/api/.env`:

```dotenv
ORDERS_MODE=test
RAZORPAY_MODE=test
RAZORPAY_KEY_ID=rzp_test_REPLACE_WITH_YOUR_TEST_KEY_ID
RAZORPAY_KEY_SECRET=REPLACE_WITH_YOUR_TEST_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=REPLACE_WITH_A_RANDOM_SECRET_AT_LEAST_16_CHARACTERS
PAYMENT_RESERVATION_MINUTES=30
```

Use actual values rather than these placeholders. The webhook secret is a separate secret you choose and enter identically in your Razorpay test-webhook configuration. The server rejects live Key IDs and requires test order mode. Restart `npm.cmd run dev` after editing the environment.

Set Razorpay's payment capture setting to automatic capture in your test account. The API never marks an authorized-only payment as paid and does not issue a capture request itself. A payment awaiting capture retains its reserved stock.

At http://localhost:4321/checkout/, select **Razorpay online · Test mode**, review the recalculated total, and continue. The saved order initially shows Pending payment. Click **Pay with Razorpay · Test** to open the official hosted test checkout. Use Razorpay's documented test payment methods; use no real payment credentials for this test workflow.

On a captured payment, the Railway/local API verifies the signature and re-fetches the payment to check the saved gateway order, amount and INR currency. The order becomes Confirmed / Paid. A signature or browser success message alone does not fulfil the order. The cart clears purchased quantities only after payment is verified; refreshing the receipt does not remove later additions again.

## Webhooks on Railway

A provider cannot deliver a webhook to your computer's `localhost`. Browser callback verification works locally using the server-to-Razorpay API; full webhook testing needs a public API endpoint. Use a test deployment of the same API on Railway, or your own temporary HTTPS forwarding setup if you already have one. No forwarding service or cloud resources were created by this update.

Configure a Razorpay **test** webhook URL pointing to your public Railway API:

```text
https://YOUR_API_DOMAIN/api/v1/payments/razorpay/webhook
```

Set its secret to the backend `RAZORPAY_WEBHOOK_SECRET`. Subscribe to:

- `payment.captured`
- `payment.authorized`
- `payment.failed`
- `order.paid`
- `refund.created`
- `refund.processed`
- `refund.failed`

The endpoint accepts Razorpay deliveries without a browser Origin header. It verifies the HMAC over the **raw request bytes** before JSON parsing, re-fetches current provider state, and deduplicates by `x-razorpay-event-id`. Do not put it behind admin login or a browser challenge. Incorrect signatures are rejected; provider/API/database failures remain retryable. Raw webhook payloads and payment instrument details are not stored.

In Railway, set the same API environment variables above, along with your existing PostgreSQL, CORS and media settings. Pages still needs only `PUBLIC_API_URL` and its existing public settings; it receives the public Key ID from a verified payment-session response when checkout opens. The API Key Secret and webhook secret stay exclusively on Railway.

If a webhook secret changes, optionally set `RAZORPAY_PREVIOUS_WEBHOOK_SECRET` to the old secret while earlier deliveries are still retrying. API Key rotation is different: payment sessions bind to their original Key ID. Drain/reconcile sessions with the original test key before changing it; the system will not silently attach old sessions to a different account/key.

## Check failures and abandoned checkout

Admin → Orders → open an online order → **Check payment** re-fetches provider state. Existing admin authentication, writer role and CSRF protections apply. Customers can use **Check payment status** in the receipt tab.

The API also runs a small reconciliation batch every 60 seconds while it is running. Work is selected from PostgreSQL; restarts do not lose reservations. Each process prevents overlapping batches, and transactional order locks make repeated settlement/release safe across replicas. No additional Railway service is needed. Actual multi-connection contention still needs deployment testing.

Unpaid online orders reserve stock for 30 minutes by default. Expired, unstarted orders can release stock immediately. If gateway setup occurred, the system checks Razorpay before restoring stock. Authorized payments and provider outages keep stock reserved until the situation is verified. Timers do not release on a blind assumption that payment failed. Expiry processing is periodic and can be delayed by provider/API downtime or a reconciliation backlog.

A timeout during provider-order creation is ambiguous. The server records it and searches Razorpay by the stable local receipt before opening checkout again; it **does not POST a second gateway order automatically**. If no matching order can be found, the order stays uncertain until reviewed/expired. Retry/check that order rather than placing another identical order.

A local reservation deadline does not revoke a Razorpay order that already exists. If a payment is captured after inventory has been returned, the order becomes **Payment review**, remains cancelled and cannot be fulfilled. Recent cancelled pending reservations are also rechecked for 48 hours; webhooks and manual reconciliation remain necessary for later changes.

Refund webhooks and re-fetching can move an order into Payment review. The original payment milestone did not initiate refunds. The newer Returns & refunds module handles approved full-order test refunds, manual COD refund records, verified refund reconciliation and controlled restocking; see ACCOUNTS-EMAILS-RETURNS-UPDATE.md. Paid online orders cannot be cancelled through the ordinary COD control. Keep these flows in test mode while validating the implemented refund/returns workflow against your own provider account.

## Test checklist

1. Successful captured payment → Confirmed / Paid, stock consumed once.
2. Failed attempt or closed popup → Pending, retry the same gateway order.
3. Authorized-only payment → Pending, no shipment permitted.
4. Reload pending receipt → payment can be resumed without a new store order.
5. Duplicate callback/webhook → one settlement and no extra stock change.
6. Expired unpaid reservation → Cancelled, stock restored once after verification.
7. Capture after cancellation → Review, no automatic fulfilment.
8. Refund notification → Review, no automatic stock return or refund request.

The automated tests use PGlite and a provider adapter stub, and the UI uses a mock of the hosted checkout callback. No actual Razorpay account, transaction, Railway deployment or public webhook was accessed during generation. Run the checklist with your own test keys and public test webhook before a live-payment milestone.

## API additions

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/payments/start` | Secret-protected gateway checkout setup/recovery |
| `POST /api/v1/payments/verify` | Secret-protected callback signature + provider verification |
| `POST /api/v1/payments/status` | Secret-protected reconciliation and reservation checks |
| `POST /api/v1/payments/razorpay/webhook` | Raw signed provider events |
| `POST /api/v1/admin/orders/:id/reconcile` | Admin writer-only payment recheck |

Migration 004 widens the order/payment status constraints, adds payment deadlines and a stock-release flag, and introduces `payment_sessions` and `payment_webhook_events`. Existing COD order values are preserved. Previously cancelled orders are marked as already released so inventory is not returned again.

## Official integration references

- [Standard checkout and signature verification](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Webhook validation and duplicate delivery](https://razorpay.com/docs/webhooks/validate-test/)
- [Fetch orders by receipt](https://razorpay.com/docs/api/orders/fetch-all/)
- [Fetch payments for an order](https://razorpay.com/docs/api/orders/fetch-payments/)
- [Refund webhook events](https://razorpay.com/docs/webhooks/refunds/)
