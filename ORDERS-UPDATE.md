# Orders & checkout update — Windows PowerShell

This update adds guest cash-on-delivery checkout and admin order management. PostgreSQL remains your database; the static storefront stays compatible with Cloudflare Pages and the API with Railway. No new paid service is needed for this milestone.

## Update your working project

1. Stop `npm.cmd run dev` with Ctrl+C.
2. Extract this updated ZIP into a **different temporary folder**.
3. Open PowerShell in that newly extracted `jewellery-store` folder.
4. Point the updater at your **old, working project**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-Project.ps1 -ProjectPath "C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store"
```

The updater backs up replaced source files, preserves your `.env` files and uploaded images, installs dependencies, and runs migration `003_orders.sql`. Migrations 001 and 002 are unchanged. It does **not** reset or reseed products, prices, stock, admin accounts or passwords.

Return to your working project and start it:

```powershell
Set-Location "C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store"
npm.cmd run dev
```

Keep PostgreSQL running. **Do not run `admin:create` again**; use your existing admin login. Docker is not required. The PowerShell helper needs execution verification on your Windows machine; it was reviewed here, but PowerShell is unavailable in the build environment.

## Try one order

1. Open http://localhost:4321/shop/ and add an available product to the cart.
2. Continue to http://localhost:4321/checkout/.
3. Enter test contact details, a ten-digit Indian mobile number beginning with 6–9, an address, and a valid-format six-digit PIN code.
4. Review the COD total and click **Place test order · COD**.
5. Note the order number. The items leave your cart; your wishlist stays saved.
6. Sign in at http://localhost:4321/admin/ and open **Orders**.
7. Open the order. Check its line items, totals, address and stock reduction.
8. Choose **Cancelled**, save, and confirm. Stock is restored once.

Test orders are real database records and **reduce available stock**. They are labelled test in both checkout and admin. Do not ship them or collect money. Cancel test orders after testing; cancellation restores their quantities even if a variant has since been archived.

## What is implemented

- Guest COD checkout, contact/address validation, delivery choice, gift wrapping and coupons.
- Prices, stock and all totals are recalculated on the API. Clients cannot submit item prices or apply prepaid savings to COD orders.
- An expected total and expected checkout mode must match. Changes require a fresh review.
- A transaction stores the order, immutable product/price/address snapshots, stock changes and an order event together. Errors roll everything back.
- Unique checkout keys prevent duplicate orders for the **same attempt**, including lost responses and retries. A deliberately new attempt can create another order.
- The exact pending request, including its address and private receipt secret, is temporarily stored in **sessionStorage** for this tab so reload/retry remains safe. On success it is removed and only a receipt identifier and secret remain. Do not submit from a shared browser profile if others can access that tab.
- A private receipt secret permits status lookup in the same tab. Receipt responses contain items/totals/status, never customer contact details or addresses. Secrets are sent in JSON request bodies, not URLs, and only hashes are stored in PostgreSQL.
- Admin order search, status/mode filters, pagination, address details, tracking fields, event history, and manually verified COD collection.
- Existing admin sessions, writer/viewer roles, CSRF/origin checks and version conflict protection apply to order management.
- Inventory consumption/cancellation increments the product version so an older admin editor cannot overwrite the new stock value.

## Order lifecycle

`Pending → Confirmed → Shipped → Delivered`

Only Pending or Confirmed can become Cancelled. Cancelled orders are closed; shipped/delivered orders require a future returns workflow. Cash collection can only be recorded for a delivered order, and a collected status cannot be reversed by an unchecked checkbox. Courier tracking can be entered while shipping. These fields record manual actions; they do not create shipping labels or call a courier.

This guide covers COD orders. The latest archive also includes optional Razorpay online test payments and reconciliation; follow PAYMENTS-UPDATE.md for that setup. The newer ACCOUNTS-EMAILS-RETURNS-UPDATE.md adds accounts, email notifications and full-order return/refund review. SMS, courier pickup and tax invoices remain future work.

## Checkout modes

Existing `.env` files work without changes because `ORDERS_MODE` defaults to `test`.

Backend `apps/api/.env` settings:

```dotenv
ORDERS_MODE=test
SHIPPING_PIN_PREFIXES=
```

- `test`: COD test orders. PIN format is checked; courier coverage is not checked. Inventory is consumed until cancellation.
- `disabled`: block new order submissions while still allowing an existing receipt/retry to recover a previously saved order.
- `live`: explicitly opt into real, manually fulfilled COD orders. Requires `SHIPPING_PIN_PREFIXES` containing verified coverage, e.g. individual PINs such as `560001,560002` or prefixes such as `560`. A prefix covers **every** valid-format PIN starting with it; use only coverage verified with your courier.

Restart the API after changing its environment. Checkout displays test mode prominently. Do not switch to live until your real catalogue, shipping charges, COD availability, delivery promises, customer support, business policies and tax/invoice handling have been configured and reviewed. Shipping, gift-wrap and coupon amounts remain the existing sample constants in `packages/contracts/src/index.ts`; this update does not establish tax treatment or courier eligibility.

The public checkout does not depend on admin cookies. Deployed admin continues to work best with storefront and API custom domains under the same parent domain as described in ADMIN-UPDATE.md. Keep database credentials and order data on the API; Pages receives only the public API URL.

## Database and API

Migration 003 adds `orders`, `order_lines`, `order_events` and an optional `order_id` on `inventory_movements`. Movement `user_id` becomes nullable for guest checkout actions. Existing movement history remains attached to its original staff account. Historical order lines reference retained product/variant records; catalogue removal remains archival, not hard deletion.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/checkout/config` | Checkout mode and configured PIN coverage |
| `POST /api/v1/orders` | Idempotent COD order submission |
| `POST /api/v1/orders/receipt` | Secret-protected minimal order receipt |
| `GET /api/v1/admin/orders` | Authenticated filtered order list |
| `GET /api/v1/admin/orders/:id` | Authenticated contact/address, snapshots and history |
| `PUT /api/v1/admin/orders/:id` | Writer-only status/tracking/payment update |

Order POSTs require an allowed storefront Origin and are rate-limited. Receipt requests accept either `{id, secret}` or `{checkoutKey, secret}`. Order creation responds 201; a replay responds 200 with the same receipt. All private/order responses are `Cache-Control: no-store`.

PostgreSQL product/variant/inventory row locks coordinate checkout with admin editing. Cancellation locks the order and restores stock in the same transaction. The test environment uses PGlite on a single connection; networked PostgreSQL and multi-connection contention still need deployment validation. Orders and quote arithmetic use integer paise; SQL monetary columns are bigint so larger valid baskets do not overflow PostgreSQL integer columns.

## Next development

Hosted online payments with verified webhooks, order emails through a durable delivery queue, customer order history, and courier/returns workflows can build on these snapshots and transactions. Keep test mode while validating these integrations.
