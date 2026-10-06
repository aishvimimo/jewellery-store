# Customer order access update

Customer accounts and verified order linking are now available separately at `/account/`; see ACCOUNTS-EMAILS-RETURNS-UPDATE.md for the latest milestone.

This update adds **My Orders** at `http://localhost:4321/orders/`. It works with COD now; no Razorpay credentials are needed. Online payment controls remain available only when your API test credentials are configured.

The existing architecture is unchanged: Astro/React static storefront on Cloudflare Pages, Fastify API on Railway, PostgreSQL on Railway, and production product images on Cloudflare R2. This milestone adds no service, dependency or database migration.

## Update on Windows

1. Stop the running development server with Ctrl+C.
2. Extract the ZIP into a separate temporary folder outside the working project.
3. Open PowerShell in the newly extracted `jewellery-store` folder and run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Update-Project.ps1 -ProjectPath "C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store"
```

`ProjectPath` points to the existing working project, not the newly extracted folder. The updater preserves `.env`, PostgreSQL data, uploads and existing administrator accounts, and checks the existing migrations. Do not reseed or recreate your admin account.

```powershell
Set-Location "C:\Users\user1\Downloads\jewellery-store-starter\jewellery-store"
npm.cmd run dev
```

## Customer experience

- My Orders is linked from the header, main navigation, footer and checkout receipt.
- After a successful checkout, the browser remembers the private receipt access. Up to 100 orders are saved, newest first.
- Opening My Orders loads the latest saved order from the API. Select another order to load it; status is not inferred from browser storage.
- Customers see the order number, test/live designation, placement date, current order/payment status, payment method, delivery option, item snapshots, totals, status history and manually entered courier tracking.
- **Refresh order status** checks the API. For online orders it also reconciles provider state. Existing test online checkout can be resumed directly from an eligible pending order.
- **Save private access code** reveals a code to copy and store privately. On another browser/device, enter it under **Open an order**. The API validates it before the order is remembered or displayed. An order number alone is insufficient.
- **Remove from this browser** removes remembered access after confirmation. It does not cancel the order, refund a payment or change stock. The checkout tab's saved receipt access is also removed when it matches that order.
- The last checkout receipt from the previous milestone is imported when available in the same browser tab, after server verification. Older orders whose secrets were never retained cannot be discovered automatically.

## Access and privacy

This is guest receipt access, not a customer account system. Browser storage contains only the private identifier/secret, order number/date and a local cart-origin flag. No address, phone or email is stored in the order-history list. The detailed response excludes personal contact/delivery data, checkout keys/hashes, internal staff notes/names and provider identifiers.

Anyone with the private access code, or access to this browser's saved data, can open the receipt and resume an eligible test payment. Codes are credentials. They are submitted in a POST request body, not placed in page URLs or search parameters. The detail endpoint enforces the allowed storefront Origin, rate limits, secret verification and `Cache-Control: no-store`. My Orders is noindex and excluded from the sitemap; private receipts are fetched after hydration, never included in static HTML.

This guest-code flow has no code revocation or forgotten-code recovery. The newer account module adds login, verified email linking, order notifications and password reset. Removing a local entry does not invalidate a saved code. Clearing browser storage or exceeding the 100-order limit removes older saved access. Keep codes privately if access must survive that. Accounts and verified email recovery require a separate authenticated workflow.

Opening an order using a code on another device does not clear that device's shopping cart. For an order placed in the same browser, verified completion clears purchased quantities once using the existing completion marker; reloads do not remove later additions again.

## Verify without Razorpay

1. Add a product to the cart and place a COD test order.
2. Click **View My Orders**. Check the order number, item snapshot and total.
3. Save its private access code, then close/reopen the page in the same browser. The order should remain available.
4. In Admin → Orders, confirm the COD order, then mark it shipped with a carrier and tracking number. Refresh My Orders and verify its status history and tracking. This is manually entered tracking, not live courier scans.
5. Open My Orders in a separate browser/private window and enter the code. Its receipt should load. A wrong code must not disclose order details.
6. Add a product to that second browser's cart. Refresh the imported receipt; the new cart item should remain.
7. Remove the receipt from that browser. The store order and stock should remain unchanged. The saved code can reopen it.

Use an unshipped test order if testing COD cancellation; existing rules prevent cancellation after dispatch. Payment capture/refund tests still require Razorpay test credentials, and public webhook tests require the public test API. See PAYMENTS-UPDATE.md.

## API addition

`POST /api/v1/orders/detail` accepts `{ "id": "ORDER_UUID", "secret": "PRIVATE_SECRET" }` and returns the secret-protected receipt plus courier tracking and safe status events. It does not provide a public order list or order-number lookup.

## Validation limits

Automated API and Happy DOM tests cover secret/origin checks, data minimization, history persistence, status changes, invalid-code rejection, removal and reopening, and cart preservation on imported access. PGlite runs the database queries. A networked PostgreSQL service, real browsers, Windows PowerShell and deployed Railway/Pages behavior still need verification in your environment. No cloud resources, provider account, email or courier services were configured by this update.
