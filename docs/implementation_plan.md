# Vertex Reseller Panel — Full End-to-End Implementation Plan

> **Scope**: Make the already-scaffolded reseller system fully working, production-grade, and polished end-to-end.
> **Stack**: Laravel 10 (PHP 8.2) + React/TypeScript (Vite) + MySQL + Redis

---

## Current State Assessment

The reseller system is **approximately 80% built**. The skeleton is solid and well-architected. Here is what exists and what is missing.

### ✅ Already Built (Working)
| Layer | What Exists |
|---|---|
| **DB Schema** | All 6 tables: `reseller_coin_balances`, `reseller_plans`, `reseller_payment_links`, `reseller_withdrawals`, `reseller_transactions`, + user columns |
| **Models** | `ResellerCoinBalance`, `ResellerPlan`, `ResellerPaymentLink`, `ResellerWithdrawal`, `ResellerTransaction` |
| **Backend: Reseller** | `ResellerController` — all 7 endpoints (overview, plans, markup, links, withdraw, withdrawals) |
| **Backend: Admin** | `AdminResellerController` — toggle status, list withdrawals, approve/reject payout |
| **Backend: Public Checkout** | `PublicPaymentLinkController` — show link details, pay (direct/local mode) |
| **Payment Gateways** | `NowPaymentsService` (invoice + IPN sig), `MaxelpayService` (session + sig) |
| **Webhooks** | `NowPaymentsWebhookController`, `MaxelpayWebhookController` — full provisioning + ledger credit |
| **Middleware** | `AuthenticateReseller` — guards reseller portal |
| **Frontend: Client** | `ResellerHubContainer.tsx` (714 lines!) — tabs for Links, Plans markup, Withdrawals |
| **Frontend: Checkout** | `PublicPaymentCheckoutContainer.tsx` — public client checkout page |
| **Frontend: Admin** | `AdminResellerManagementContainer.tsx` — toggle reseller status, process withdrawals |
| **API layer (TS)** | `reseller.ts` + `admin/reseller.ts` — all typed API calls |
| **Routing** | `/reseller` and `/pay/:uuid` in DashboardRouter, admin routes missing in AdminRouter |

### ❌ Missing / Broken / Incomplete
1. **Admin reseller route not wired in `AdminDashboardRouter.tsx`** — the page exists (`AdminResellerManagementContainer.tsx`) but has no route entry and no nav link
2. **No node selector in link creation form** — `createPaymentLink` requires `node_id` but the UI may not pass it correctly; need to verify and fetch node list
3. **`.env` missing gateway keys** — `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `MAXELPAY_API_KEY`, `MAXELPAY_SECRET_KEY` not in `.env.example`
4. **`config/services.php` missing nowpayments/maxelpay entries** — need to verify these config keys exist
5. **`reseller_plan_type` column missing** — migration only adds `is_reseller` and `reseller_notes`, not `reseller_plan_type` on users table
6. **`coinBalances` relationship missing on `User.php`** — `AdminResellerController` calls `$user->coinBalances` as an eager-loaded relation but it may not be declared
7. **Race condition in NOWPayments webhook** — server credit happens without DB transaction lock (unlike `withdraw()` which properly uses `DB::transaction`)
8. **No email/notification on server delivery** — end client gets no notification when their VPS is ready
9. **Checkout page doesn't handle redirect back from gateway** — when NOWPayments/Maxelpay redirect to `/pay/{uuid}?status=success`, the page should poll and show a "paid" confirmation without requiring password entry again
10. **`PublicPaymentLinkController@pay` requires auth** — `$request->user()` returns null for unauthenticated end-clients going through crypto gateway (they got redirected back and don't have a session); this breaks the server→user binding
11. **Payment link expiry** — links never expire (no scheduled job to mark `pending` links as `expired` after a time window)
12. **Admin withdrawal flow missing transaction history tab** — admin can approve/reject but can't view per-reseller transaction ledger
13. **Missing `reseller.ts` admin API** — confirm `resources/scripts/api/admin/reseller.ts` exists

---

## How It All Works — System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         RESELLER ECOSYSTEM                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ADMIN                                                               │
│  ├─ Grants reseller status + model type (zero_cost / own_inventory)  │
│  ├─ Reviews pending withdrawal queue                                 │
│  └─ Approves payouts with blockchain TxID / Rejects with reason      │
│                                                                      │
│  RESELLER (logged in user with is_reseller = true)                   │
│  ├─ Dashboard: /reseller  → ResellerHubContainer                     │
│  ├─ Tab 1 — Payment Links                                            │
│  │   ├─ Pick plan, node, OS template, coin, server name              │
│  │   ├─ Creates NOWPayments invoice → gets checkout URL              │
│  │   └─ Shares /pay/{uuid} link with their end-client                │
│  ├─ Tab 2 — Plan Markups                                             │
│  │   └─ Set % markup per plan (≤30% for zero_cost, unlimited own)    │
│  └─ Tab 3 — Withdrawals                                              │
│      ├─ Submit withdrawal: coin + amount + wallet address            │
│      └─ View ledger history                                          │
│                                                                      │
│  END CLIENT (public, possibly unauthenticated)                       │
│  ├─ Opens /pay/{uuid}  → PublicPaymentCheckoutContainer              │
│  ├─ Sees: plan specs, price, reseller name                           │
│  ├─ Option A: Click "Pay with Crypto" → redirected to NOWPayments    │
│  │   └─ NOWPayments sends IPN webhook → server auto-provisioned      │
│  └─ Option B: Click "Pay via Maxelpay" → redirected to Maxelpay      │
│      └─ Maxelpay sends webhook → server auto-provisioned             │
│                                                                      │
│  PAYMENT FLOW (crypto gateway path)                                  │
│  [End Client pays on gateway] → [Webhook hits panel] →               │
│  [Server provisioned on Proxmox] → [Reseller balance credited]       │
│  → [End client server appears in their dashboard]                    │
│                                                                      │
│  WITHDRAWAL FLOW                                                     │
│  [Reseller submits withdrawal] → [balance locked atomically] →       │
│  [Admin sees pending withdrawal] → [Admin sends crypto manually] →   │
│  [Admin enters TxID] → [balance deducted, withdrawal = approved]     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Changes (by priority)

### Phase 1 — Critical Blockers (Must Fix to Work At All)

---

#### [MODIFY] [`config/services.php`](file:///d:/Downloads/Vertex-Panel/config/services.php)
Add `nowpayments` and `maxelpay` config entries so `config('services.nowpayments.api_key')` works.

```php
'nowpayments' => [
    'api_key'    => env('NOWPAYMENTS_API_KEY', ''),
    'ipn_secret' => env('NOWPAYMENTS_IPN_SECRET', ''),
    'mode'       => env('NOWPAYMENTS_MODE', 'SANDBOX'),
],
'maxelpay' => [
    'api_key'    => env('MAXELPAY_API_KEY', ''),
    'secret_key' => env('MAXELPAY_SECRET_KEY', ''),
    'mode'       => env('MAXELPAY_MODE', 'STAGING'),
],
```

---

#### [MODIFY] [`.env.example`](file:///d:/Downloads/Vertex-Panel/.env.example)
Append the gateway keys so developers know what to configure.

---

#### [NEW] Migration: `add_reseller_plan_type_to_users_table.php`
Add `reseller_plan_type` column to users (it's referenced in code but missing from the migration):
```php
$table->string('reseller_plan_type')->nullable()->after('reseller_notes');
```

---

#### [MODIFY] [`User.php`](file:///d:/Downloads/Vertex-Panel/app/Models/User.php)
Add `coinBalances` Eloquent relationship:
```php
public function coinBalances(): HasMany
{
    return $this->hasMany(ResellerCoinBalance::class, 'user_id');
}
```
Also ensure `is_reseller`, `reseller_notes`, `reseller_plan_type` are in `$fillable` / `$casts`.

---

### Phase 2 — Payment & Webhook Correctness

---

#### [MODIFY] [`NowPaymentsWebhookController.php`](file:///d:/Downloads/Vertex-Panel/app/Http/Controllers/Client/Reseller/NowPaymentsWebhookController.php)
Wrap server creation + balance credit in a `DB::transaction()` + use `lockForUpdate()` on the payment link to prevent duplicate provisioning if gateway fires the webhook twice:
```php
DB::transaction(function() use (...) {
    $link = ResellerPaymentLink::where('uuid', $uuid)
        ->where('status', 'pending')
        ->lockForUpdate()
        ->first();
    // ... rest of logic
});
```

#### [MODIFY] [`MaxelpayWebhookController.php`](file:///d:/Downloads/Vertex-Panel/app/Http/Controllers/Client/Reseller/MaxelpayWebhookController.php)
Same transaction + lock fix.

---

#### [MODIFY] [`PublicPaymentLinkController.php`](file:///d:/Downloads/Vertex-Panel/app/Http/Controllers/Client/Reseller/PublicPaymentLinkController.php)
**Problem**: `$request->user()` is null for unauthenticated clients who paid via crypto gateway. The webhook already provisioned the server. The `pay()` endpoint is only for the **local/direct checkout** fallback — that's fine, but it should clearly state "login required for local checkout."

**Fix**: Add a new endpoint `GET /pay/{uuid}/status` that returns the current link status. The frontend polls this after gateway redirect. No auth needed.

---

### Phase 3 — Admin Reseller UI Integration

---

#### [MODIFY] [`AdminDashboardRouter.tsx`](file:///d:/Downloads/Vertex-Panel/resources/scripts/routers/AdminDashboardRouter.tsx)
Add route entry for `/admin/resellers` pointing to `AdminResellerManagementContainer`.
Add nav link in the sidebar nav array.

---

#### [MODIFY] [`resources/scripts/api/admin/reseller.ts`](file:///d:/Downloads/Vertex-Panel/resources/scripts/api/admin/reseller.ts)
Verify it exists, has `AdminResellerUser`, `AdminWithdrawalItem` types and all HTTP calls (`getAdminResellers`, `toggleResellerStatus`, `getAdminWithdrawals`, `approveWithdrawal`, `rejectWithdrawal`).

---

### Phase 4 — Payment Link UX & Checkout Improvements

---

#### [MODIFY] [`PublicPaymentCheckoutContainer.tsx`](file:///d:/Downloads/Vertex-Panel/resources/scripts/components/reseller/PublicPaymentCheckoutContainer.tsx)
Handle `?status=success` and `?status=cancelled` query params (appended by gateway redirect URLs).
- On `?status=success`: Show spinner + poll `GET /api/client/pay/{uuid}` every 5s until status = `paid`. Then show success screen with server info.
- On `?status=cancelled`: Show "Payment cancelled" message with retry button.

---

#### [NEW] `GET /api/client/pay/{uuid}/status` endpoint (no auth)
Returns `{ status: 'pending'|'paid'|'expired', server_id?, paid_at? }`. Used by the frontend polling loop. Add to `PublicPaymentLinkController@status` and wire in `routes/api-client.php`.

---

### Phase 5 — Scheduled Jobs & Background Processing

---

#### [NEW] `ExpireResellerPaymentLinksJob.php`
Artisan command / scheduled job that marks payment links as `expired` if `status = 'pending'` and `created_at` is older than 72 hours. Register in `app/Console/Kernel.php` (or `routes/console.php` in Laravel 10+) to run every hour.

---

#### [NEW] Optional: Email notification on server delivery
When a server is provisioned via webhook, fire a `Mailable` (if mail is configured) to the end client's email. This requires a `client_email` field on the payment link or looking up the user. Optional — low priority.

---

### Phase 6 — Polish & Security Hardening

---

#### Webhook security already correct
Both webhook controllers verify HMAC signatures. ✅

#### Rate limiting on payment endpoints
Add `throttle:60,1` middleware to the `pay/{uuid}` POST endpoint to prevent brute force.

#### Link length validation
`server_name` has `min:2|max:40`. Hostname is slugified. ✅

---

## Verification Plan

### Manual End-to-End Test Flow (Sandbox Mode)

1. Set `NOWPAYMENTS_MODE=SANDBOX` + valid sandbox API key in `.env`
2. Admin → grant user reseller access (zero_cost)
3. Reseller → configure plan markup (e.g. 15%)
4. Reseller → create payment link → get checkout URL
5. Open checkout URL in browser → click "Pay with Crypto"
6. Observe NOWPayments sandbox auto-complete (sandbox sends `case=success`)
7. Check Laravel logs: IPN received, signature verified, server provisioned, balance credited
8. Check `reseller_coin_balances` in DB: balance increased by markup amount
9. Reseller Hub → Withdrawals tab → submit withdrawal
10. Admin → Reseller Withdrawals → approve with a fake TxID
11. Check `reseller_transactions` audit log has all entries

### Automated Checks
```bash
php artisan test --filter=Reseller  # if tests exist
php artisan migrate:status          # confirm all migrations run
php artisan route:list | grep reseller  # confirm all routes registered
```

---

## Open Questions

> [!IMPORTANT]
> **Payment gateway mode**: Do you want NOWPayments as primary and Maxelpay as fallback (current code), or should one always be used? Currently if `NOWPAYMENTS_API_KEY` is empty, it falls through to Maxelpay, then local checkout. Confirm this is the desired priority order.

> [!IMPORTANT]
> **End client authentication for crypto payments**: When an end-client pays via NOWPayments, they are NOT logged into the panel. The webhook provisions the server but assigns it to `reseller_id` as fallback if `client_user_id` is null. Do you want:
> - Option A: Keep current behavior (server goes to reseller account, reseller manually transfers or grants access)
> - Option B: Require end-client to create/login to a panel account before paying (login gate on checkout page)
> - Option C: Auto-create a guest account for the end-client using email from payment gateway metadata

> [!IMPORTANT]
> **Withdrawal process**: Currently 100% manual — admin receives payout request, manually sends crypto from their own wallet, then enters the TxID. Is this correct? Or do you want automated on-chain payout integration (e.g. using a hot wallet API)?

> [!WARNING]
> **`reseller_plan_type` column**: The code references `$user->reseller_plan_type` in multiple places but the migration only adds `is_reseller` and `reseller_notes`. This will cause a runtime error on first use. This MUST be fixed before going live.

---

## Summary: Files to Create/Modify

| Action | File |
|---|---|
| [MODIFY] | [`config/services.php`](file:///d:/Downloads/Vertex-Panel/config/services.php) |
| [MODIFY] | [`.env.example`](file:///d:/Downloads/Vertex-Panel/.env.example) |
| [NEW] | `database/migrations/..._add_reseller_plan_type_to_users_table.php` |
| [MODIFY] | [`app/Models/User.php`](file:///d:/Downloads/Vertex-Panel/app/Models/User.php) |
| [MODIFY] | [`NowPaymentsWebhookController.php`](file:///d:/Downloads/Vertex-Panel/app/Http/Controllers/Client/Reseller/NowPaymentsWebhookController.php) — add DB transaction lock |
| [MODIFY] | [`MaxelpayWebhookController.php`](file:///d:/Downloads/Vertex-Panel/app/Http/Controllers/Client/Reseller/MaxelpayWebhookController.php) — add DB transaction lock |
| [MODIFY] | [`PublicPaymentLinkController.php`](file:///d:/Downloads/Vertex-Panel/app/Http/Controllers/Client/Reseller/PublicPaymentLinkController.php) — add `status` endpoint |
| [MODIFY] | [`routes/api-client.php`](file:///d:/Downloads/Vertex-Panel/routes/api-client.php) — add `GET /pay/{uuid}/status` |
| [MODIFY] | [`AdminDashboardRouter.tsx`](file:///d:/Downloads/Vertex-Panel/resources/scripts/routers/AdminDashboardRouter.tsx) — add reseller route + nav |
| [VERIFY/MODIFY] | `resources/scripts/api/admin/reseller.ts` — confirm or create |
| [MODIFY] | [`PublicPaymentCheckoutContainer.tsx`](file:///d:/Downloads/Vertex-Panel/resources/scripts/components/reseller/PublicPaymentCheckoutContainer.tsx) — handle gateway redirect params + polling |
| [NEW] | `app/Console/Commands/ExpireResellerPaymentLinks.php` |

---
*Plan generated: 2026-09-12. Ready for execution upon approval.*
