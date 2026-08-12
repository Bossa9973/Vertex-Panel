# Comprehensive Technical & Business Guide: Vertex Reseller Panel System

This document presents an exhaustive, end-to-end breakdown of how the **Reseller Panel** operates within the system. It covers **business-wise operation**, **code-wise implementation**, and the complete **end-client user experience** (payment link receipt, checkout UI, server provisioning delivery, and post-purchase server management).

---

## 1. Business-Wise Overview & Economic Architecture

The Reseller Panel enables authorized partners to sell VPS server hosting packages to their own end-clients without needing to host billing systems, maintain server nodes, or manage virtual machine daemons.

### 1.1 Core Reseller Business Models
The platform supports two distinct reseller operation models configured on a per-reseller or per-plan basis:

```
                          ┌─────────────────────────────────────────┐
                          │         VPS Reseller Ecosystem          │
                          └────────────────────┬────────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       ▼                                               ▼
      ┌─────────────────────────────────┐             ┌─────────────────────────────────┐
      │     Zero-Cost Model (0-Cost)    │             │       Own Inventory Model       │
      ├─────────────────────────────────┤             ├─────────────────────────────────┤
      │ • No upfront node inventory     │             │ • Reseller owns capacity/quota │
      │ • Markup capped at strictly 30% │             │ • Arbitrary pricing (No cap)    │
      │ • System deducts base plan cost │             │ • 100% of checkout price goes   │
      │ • Reseller keeps net markup     │             │   to reseller coin balance      │
      └─────────────────────────────────┘             └─────────────────────────────────┘
```

1. **Zero-Cost Model (`zero_cost`)**:
   - **Target User**: Partners operating without upfront infrastructure commitment or pre-purchased server nodes.
   - **Pricing Rule**: The reseller sets a percentage markup over the system's `base_price` of a VPS plan.
   - **Markup Limitation**: Systems strictly cap the zero-cost markup at **30.00%** (`max_zero_cost_markup`).
   - **Formula**: `Selling Price = Base Price * (1 + Markup Percent / 100)`
   - **Revenue Split**: Upon end-client payment, the system retains the `base_price` to cover node infrastructure costs and credits only the `markup_amount` (`Selling Price - Base Price`) to the reseller's crypto balance.

2. **Own Inventory Model (`own_inventory`)**:
   - **Target User**: Established resellers who own allocated node capacity, hardware resources, or custom wholesale agreements.
   - **Pricing Rule**: The reseller defines a total `custom_price` without any percentage cap.
   - **Revenue Split**: Upon end-client payment, **100%** of the `selling_price` is credited directly to the reseller's crypto balance.

---

### 1.2 End-to-End Client Lifecycle & Financial Workflow

```
[ Reseller Dashboard ] ──(1. Select VPS Plan, OS Template, Coin)──► [ Create Payment Link ]
                                                                             │
                                                                             ▼
[ End Client Checkout ] ◄──(2. Shares URL /pay/{uuid})───────────────────────┘
          │
          ├──(3A. Crypto Checkout via NOWPayments / Maxelpay)──► [ Gateway Webhook ]
          │                                                             │
          └──(3B. Direct Password Entry on Local Checkout)──────────────┤
                                                                        ▼
                                                   [ 4. Automated VPS Provisioning ]
                                                                        │
                                                                        ▼
                                                   [ 5. Ledger Profit Credit ]
                                                                        │
                                                                        ▼
[ Admin Wallet Payout ] ◄──(7. Approve Payout & TxID)─── [ 6. Reseller Crypto Withdrawal ]
```

1. **Link Generation**: The reseller creates a unique Payment Link (`/pay/{uuid}`) bound to a VPS plan, target node, OS template, server name, and target cryptocurrency (`USDT`, `SOL`, `BTC`, `LTC`, `ETH`).
2. **Client Checkout**: The end-client opens the public link. They see plan specs (CPU, RAM, Disk, OS) and reseller branding.
3. **Gateway Integration**:
   - Primary gateway: **NOWPayments** (creates invoice URL).
   - Secondary gateway: **Maxelpay** (creates payment session URL).
   - Local fallback: System checkout at `/pay/{uuid}` with password creation.
4. **Automated Server Provisioning**: Once payment is verified by webhook signature or direct submit:
   - System calls the `ServerCreationService` daemon to instantiate the VM on the specified node.
   - Server expiration is set to 30 days.
   - An account record is bound to the end-client user.
5. **Ledger Revenue Credit**: The calculated profit (`markup_amount` or `selling_price`) is credited instantly into the reseller's `ResellerCoinBalance` in the requested cryptocurrency.
6. **Withdrawal & Payout**: Resellers can request withdrawals to their crypto wallet address ($10 USD minimum equivalent threshold). Funds are locked immediately to prevent double-spending until an Admin approves with a blockchain transaction hash (`tx_hash`) or rejects with feedback.

---

### 1.3 Detailed Financial Unit Economics & Profit Calculations

To illustrate how revenue flows through the system, consider the following unit economic case studies:

#### Case Study A: Zero-Cost Model Margin Economics
- **System Base VPS Plan Price**: `$10.00 / month` (Covers node hypervisor overhead, hardware depreciation, power, and bandwidth transit).
- **Reseller Markup Configured**: `25.00%` (Valid under the 30.00% ceiling).
- **End-Client Retail Checkout Price**: `$10.00 * (1 + 0.25) = $12.50 / month`.
- **Financial Settlement Execution**:
  - **Platform Infrastructure Collection**: `$10.00` retained by platform.
  - **Reseller Net Profit**: `$2.50` (`$12.50 - $10.00`) credited directly to reseller's `ResellerCoinBalance`.
  - **Upfront Inventory Capital Risk**: `$0.00` for the reseller.

#### Case Study B: Own Inventory Model Margin Economics
- **Reseller Allocated Capacity**: Reseller operates on bulk dedicated hardware quota or owned node inventory.
- **Reseller Custom Selling Price**: `$20.00 / month`.
- **Financial Settlement Execution**:
  - **Reseller Net Credit**: `$20.00` (100% of retail checkout proceeds credited directly to reseller's `ResellerCoinBalance`).

---

### 1.4 Crypto Treasury, Volatility Protection & Balance Isolation

1. **Asset Settlement Isolation**:
   - Earnings are credited in the exact target cryptocurrency specified by the payment link (`USDT`, `SOL`, `BTC`, `LTC`, `ETH`).
   - Prevents forced foreign exchange (FX) conversion slippage or unconsented currency conversions.
2. **Atomic Balance Locking (`locked_balance`)**:
   - **Total Balance (`balance`)**: Represents cumulative lifetime unwithdrawn net earnings.
   - **Locked Balance (`locked_balance`)**: Represents funds currently pending administrative withdrawal verification.
   - **Available Balance (`balance - locked_balance`)**: Real-time spendable/withdrawable liquidity pool.
   - When a reseller submits a payout request, funds transition from Available to Locked instantly. This guarantees strict atomic accounting and eliminates double-spending race conditions.
3. **Dust Attack Prevention ($10 USD Minimum Threshold)**:
   - Withdrawal requests enforce minimum threshold limits (`USDT`: 10.00, `SOL`: 0.05, `BTC`: 0.0002, `LTC`: 0.15, `ETH`: 0.003 ~ $10 USD).
   - Protects network efficiency and ensures blockchain transaction gas fees do not erode payout value.

---

### 1.5 Governance, Anti-Gouging Controls & Partner Delegation

1. **Vetted Reseller Onboarding**:
   - Reseller status is restricted; admins manually grant or revoke partner access (`is_reseller = true`).
   - Admins record custom operational notes (`reseller_notes`) to track individual partner agreements or custom commission tiers.
2. **Anti-Gouging Price Guardrails**:
   - The strict **30.00% markup cap** on the `zero_cost` model prevents reseller price-gouging.
   - Protects brand reputation, maintains fair retail hosting pricing, and prevents market distortion across partner links.

---

### 1.6 Recurring Revenue (MRR), Lifetime Value (LTV) & Chargeback Immunity

1. **Automated 30-Day Billing Cycles**:
   - All provisioned VPS servers operate on 30-day initial renewal terms (`expires_at = Carbon::now()->addDays(30)`).
2. **Predictable Recurring Revenue (MRR)**:
   - Ongoing monthly client renewals continue the automated profit split, creating predictable long-term Monthly Recurring Revenue (MRR) for both reseller and hosting provider.
3. **Chargeback Immunity**:
   - Crypto payment rails (NOWPayments / Maxelpay) eliminate traditional credit card chargeback fraud and payment reversal risks.
   - Once a transaction is confirmed on the blockchain, funds are non-reversible, protecting resellers from malicious end-client payment disputes.

---

### 1.7 Multi-Currency Audit Trail & Financial Transparency

Every financial event updates the `reseller_transactions` table with immutable audit records:
- **`earnings_credit`**: Positive credit logged when an end-client pays for a payment link.
- **`withdrawal_locked`**: Temporary freeze logged when a reseller requests a payout.
- **`withdrawal_completed`**: Final deduction logged when an admin approves payout with a verified blockchain TxID (`tx_hash`).
- **`withdrawal_refunded`**: Reversal credit logged if an admin rejects a payout request, unlocking the balance back to the reseller's available pool.

---

## 2. Reseller's End-Client Experience & Delivery Flow

This section details step-by-step how an end-client experiences receiving, paying for, and managing their VPS server.

```
                              END-CLIENT EXPERIENCE PIPELINE
  
 ┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
 │ 1. Link Receipt        │      │ 2. Payment Execution   │      │ 3. Automated Delivery  │
 ├────────────────────────┤      ├────────────────────────┤      ├────────────────────────┤
 │ • Opens /pay/{uuid}    │ ───► │ • Selects crypto / coin│ ───► │ • Webhook / Pay hit    │
 │ • Views partner brand  │      │ • Pays invoice         │      │ • Proxmox/KVM daemon   │
 │ • Reviews CPU/RAM/Disk │      │ • Sets root password   │      │   provisions VM instantly│
 └────────────────────────┘      └────────────────────────┘      └───────────┬────────────┘
                                                                             │
                                                                             ▼
                                                                 ┌────────────────────────┐
                                                                 │ 4. Server Management   │
                                                                 ├────────────────────────┤
                                                                 │ • Server in Dashboard  │
                                                                 │ • Power Start/Stop/Reboot│
                                                                 │ • VNC Console Access   │
                                                                 │ • 30-day active term   │
                                                                 └────────────────────────┘
```

### 2.1 Step 1: Receiving the Payment Link & Branded Checkout
1. **Link URL**: The end-client receives a custom URL from the reseller (e.g., `https://vertexnodes.net/pay/550e8400-e29b-41d4-a716-446655440000`).
2. **Branded Visual Checkout**:
   - The checkout page renders partner branding badge: `"Sold by {Reseller Name}"` or `"Partner Hosted VPS"`.
   - **Server Information**: Displays the server name assigned by reseller (e.g., `Game-Node-01`), hypervisor node location, and OS image template (e.g., `Ubuntu 22.04 LTS`).
   - **Hardware Specs Card**: Clear visualization of vCPU cores, RAM size (MB/GB), Storage capacity (GB), and target crypto currency (`USDT`, `SOL`, `BTC`, `LTC`, `ETH`).
   - **Transparent Pricing**: Displays monthly price in USD / Crypto equivalence without showing background system base costs.

### 2.2 Step 2: Payment Execution
1. **Gateway Redirect (Crypto)**:
   - Clicking **"Pay $X with Crypto"** routes the client to the gateway invoice page (NOWPayments or Maxelpay).
   - The gateway displays an exact deposit QR code and crypto address.
   - Gateway sends IPN webhook callback back to panel upon blockchain transaction confirmation.
2. **Local Checkout / Sandbox Mode**:
   - If direct panel checkout is enabled, client enters an optional custom Root Password.
   - Clicking **"Confirm & Deploy VPS"** triggers immediate server deployment.
3. **Payment Confirmation Screen**:
   - Once payment completes, the checkout UI updates automatically with a confirmation state: **"Payment Confirmed!"** displaying server name, paid amount, and completion badge.

### 2.3 Step 3: Server Provisioning & Immediate Delivery
1. **Daemon VM Creation**:
   - Backend calls `ServerCreationService->handle($serverData)`.
   - Computes limits: CPU cores, RAM bytes (`ram * 1024 * 1024`), Disk bytes (`disk * 1024 * 1024 * 1024`).
   - Generates hostname: `{slugified-server-name}.vertexnodes.net`.
   - Provisions virtual machine on hypervisor node, attaches selected OS template, sets initial root password, and boots the VM.
2. **Account Linking**:
   - The server record (`Server`) is assigned `user_id = $clientUser->id`.
   - Sets initial term expiration date to 30 days (`expires_at = Carbon::now()->addDays(30)`).
   - The payment link status flips to `paid` and links `server_id` for tracking.

### 2.4 Step 4: Post-Purchase Server Management
Once provisioned, the end-client has full control over their VPS via the panel client dashboard:

1. **Dashboard Visibility**:
   - Client logs into the Panel Dashboard (`/servers`).
   - The newly provisioned VPS appears immediately under their active servers list with status `Running` / `Active`.
2. **Control Capabilities**:
   - **Power Management**: Instant Start, Stop, Reboot, and Hard Shutdown buttons.
   - **Interactive Web Console**: Built-in VNC / SSH web terminal to access command prompt directly from the browser.
   - **Live Resource Metrics**: Real-time graphs for CPU load percentage, RAM usage, and Disk space utilization.
   - **Network & IP Info**: View assigned public IPv4/IPv6 address and port forwarding configs.
   - **Expiration & Term**: Monitors 30-day active countdown with renewal capabilities.

---

## 3. Code-Wise Architecture & Implementation

### 3.1 Database Schema & Migrations

The reseller architecture is backed by 5 dedicated tables and extensions on the `users` table across 3 migration files:
- [2026_08_09_000000_create_reseller_tables.php](file:///d:/Downloads/panel-main/panel-main/database/migrations/2026_08_09_000000_create_reseller_tables.php)
- [2026_08_09_100928_add_reseller_maxelpay_fields.php](file:///d:/Downloads/panel-main/panel-main/database/migrations/2026_08_09_100928_add_reseller_maxelpay_fields.php)
- [2026_08_09_153000_add_nowpayments_fields_to_reseller_payment_links.php](file:///d:/Downloads/panel-main/panel-main/database/migrations/2026_08_09_153000_add_nowpayments_fields_to_reseller_payment_links.php)

#### Table Structure Summary

| Table | Core Columns & Types | Key Constraints / Indexes | Purpose |
|---|---|---|---|
| `users` | `is_reseller` (bool), `reseller_notes` (text), `reseller_plan_type` (string) | Added after `root_admin` | Stores reseller access permission and global model choice |
| `reseller_coin_balances` | `user_id` (FK), `coin` (string: USDT, SOL, BTC, LTC, ETH), `balance` (decimal 18,8), `locked_balance` (decimal 18,8) | UNIQUE(`user_id`, `coin`) | Multi-coin ledger tracking available and locked withdrawal balances |
| `reseller_plans` | `reseller_id` (FK), `vps_plan_id` (FK), `model_type` (enum), `base_price` (decimal 10,2), `markup_percent` (decimal 5,2), `custom_price` (decimal 10,2), `active` (bool) | FK to `users` & `vps_plans` | Per-plan custom reseller pricing rules & markups |
| `reseller_payment_links` | `uuid` (unique), `reseller_id` (FK), `reseller_plan_id` (FK), `vps_plan_id` (FK), `node_id` (FK), `template_uuid`, `server_name`, `model_type`, `base_price`, `selling_price`, `markup_amount`, `coin`, `status` (pending/paid/expired), `maxelpay_session_id`, `maxelpay_status`, `nowpayments_payment_id`, `nowpayments_status`, `checkout_url`, `client_user_id` (FK), `server_id` (FK), `paid_at` | Unique `uuid`, FKs to `users`, `vps_plans`, `nodes`, `servers` | Tracks client payment links, gateway invoice status, and server binding |
| `reseller_withdrawals` | `uuid` (unique), `user_id` (FK), `coin`, `amount` (decimal 18,8), `wallet_address`, `status` (pending/approved/rejected), `tx_hash`, `admin_notes` | Unique `uuid`, FK to `users` | Crypto payout requests submitted by resellers |
| `reseller_transactions` | `user_id` (FK), `type` (earnings_credit, withdrawal_locked, withdrawal_completed, withdrawal_refunded), `coin`, `amount` (decimal 18,8), `reference_id`, `description` | FK to `users` | Immutable audit trail for all reseller financial balance updates |

---

### 3.2 Domain Models & Relationships

- **[User.php](file:///d:/Downloads/panel-main/panel-main/app/Models/User.php#L46-L100)**: Casts `is_reseller` as boolean, appends `reseller_notes` and `reseller_plan_type` in API serialization (`toReactObject`).
- **[ResellerCoinBalance.php](file:///d:/Downloads/panel-main/panel-main/app/Models/ResellerCoinBalance.php)**: Belongs to `User`.
- **[ResellerPlan.php](file:///d:/Downloads/panel-main/panel-main/app/Models/ResellerPlan.php)**: Belongs to `User` (`reseller_id`) and `VpsPlan` (`vps_plan_id`).
- **[ResellerPaymentLink.php](file:///d:/Downloads/panel-main/panel-main/app/Models/ResellerPaymentLink.php)**: Belongs to `User` (`reseller_id`), `ResellerPlan`, `VpsPlan`, `Node`, `User` (`client_user_id`), and `Server`.
- **[ResellerWithdrawal.php](file:///d:/Downloads/panel-main/panel-main/app/Models/ResellerWithdrawal.php)**: Belongs to `User`.
- **[ResellerTransaction.php](file:///d:/Downloads/panel-main/panel-main/app/Models/ResellerTransaction.php)**: Belongs to `User`.

---

### 3.3 Access Control & Middleware

**[AuthenticateReseller.php](file:///d:/Downloads/panel-main/panel-main/app/Http/Middleware/AuthenticateReseller.php#L19-L21)**:
Enforces route authorization for all client reseller endpoints:
```php
if (!$user || (!$user->is_reseller && !$user->root_admin)) {
    throw new AccessDeniedHttpException('Reseller portal access is required.');
}
```
*Note*: `root_admin` users automatically bypass reseller permission checks so administrators can test reseller workflows seamlessly.

---

### 3.4 API Route Registry

Registered in [routes/api-client.php](file:///d:/Downloads/panel-main/panel-main/routes/api-client.php#L93-L118) and [routes/api-admin.php](file:///d:/Downloads/panel-main/panel-main/routes/api-admin.php#L263-L275):

#### Client Reseller Endpoints (`/api/client/reseller`)
- `GET /overview` ➔ `ResellerController@overview`: Returns coin balances and link/withdrawal statistics.
- `GET /plans` ➔ `ResellerController@getPlans`: Lists VPS plans merged with reseller custom pricing.
- `POST /plans` ➔ `ResellerController@savePlanMarkup`: Saves markup percentage/custom price (enforces 30% max markup cap on `zero_cost`).
- `GET /links` ➔ `ResellerController@getPaymentLinks`: Returns paginated payment links.
- `POST /links` ➔ `ResellerController@createPaymentLink`: Generates link & creates NOWPayments or Maxelpay sessions.
- `POST /withdraw` ➔ `ResellerController@withdraw`: Validates minimum $10 threshold, locks balance, creates pending withdrawal.
- `GET /withdrawals` ➔ `ResellerController@getWithdrawals`: Returns paginated withdrawal history.

#### Public Client Checkout Endpoints (`/api/client/pay`)
- `GET /pay/{uuid}` ➔ `PublicPaymentLinkController@show`: Public details endpoint for end-client checkout page.
- `POST /pay/{uuid}` ➔ `PublicPaymentLinkController@pay`: Direct client payment/provisioning endpoint.

#### Payment Gateway Webhooks (`/api/client/webhooks`)
- `POST /webhooks/nowpayments` ➔ `NowPaymentsWebhookController@handle`: NOWPayments IPN verification & server auto-provisioning.
- `POST /webhooks/maxelpay` ➔ `MaxelpayWebhookController@handle`: Maxelpay signature verification & server auto-provisioning.

#### Admin Reseller Management Endpoints (`/api/admin/resellers`)
- `GET /` ➔ `AdminResellerController@index`: List & filter users, search by name/email, display coin balances.
- `POST /{id}/toggle-status` ➔ `AdminResellerController@toggleResellerStatus`: Grant/revoke reseller permission & model type.
- `GET /withdrawals` ➔ `AdminResellerController@getWithdrawals`: List reseller crypto withdrawal queue.
- `POST /withdrawals/{id}/approve` ➔ `AdminResellerController@approveWithdrawal`: Approve withdrawal, record `tx_hash`, deduct locked balance.
- `POST /withdrawals/{id}/reject` ➔ `AdminResellerController@rejectWithdrawal`: Reject withdrawal, unlock balance back to available pool.

---

### 3.5 Detailed Backend Logic Flow

#### A. Plan Markup Configuration ([ResellerController.php:L99-L142](file:///d:/Downloads/panel-main/panel-main/app/Http/Controllers/Client/Reseller/ResellerController.php#L99-L142))
1. Validates `vps_plan_id`, `model_type` (`own_inventory` | `zero_cost`), `markup_percent`, and `custom_price`.
2. For `zero_cost`: checks `$validated['markup_percent'] > 30.00`. If exceeded, returns HTTP 422 error response.
3. Calculates `custom_price`: `round(vpsPlan->price * (1 + (markup_percent / 100)), 2)`.
4. Saves or updates the `ResellerPlan` record.

#### B. Payment Link & Gateway Session Generation ([ResellerController.php:L147-L280](file:///d:/Downloads/panel-main/panel-main/app/Http/Controllers/Client/Reseller/ResellerController.php#L147-L280))
1. Validates plan ID, node ID, template UUID, server name, and crypto coin (`USDT`, `SOL`, `BTC`, `LTC`, `ETH`).
2. Calculates selling price and markup amount.
3. Creates a `ResellerPaymentLink` record in state `pending`.
4. **NOWPayments Attempt**: If `services.nowpayments.api_key` is present, invokes `NowPaymentsService->createInvoice()`. Stores `nowpayments_payment_id` and sets `checkout_url` to NOWPayments invoice URL.
5. **Maxelpay Fallback**: If NOWPayments is inactive/failed and `services.maxelpay.api_key` exists, calls `MaxelpayService->createSession()`. Stores `maxelpay_session_id` and checkout URL.
6. **Local Hosted Checkout Fallback**: If no remote payment gateway key is present, sets `checkout_url` to `url("/pay/{uuid}")`.

#### C. Automated Server Provisioning & Profit Settlement ([NowPaymentsWebhookController.php:L21-L168](file:///d:/Downloads/panel-main/panel-main/app/Http/Controllers/Client/Reseller/NowPaymentsWebhookController.php#L21-L168) & [MaxelpayWebhookController.php:L21-L166](file:///d:/Downloads/panel-main/panel-main/app/Http/Controllers/Client/Reseller/MaxelpayWebhookController.php#L21-L166))
1. **Signature Verification**: Validates request HMAC signature against raw payload (`x-nowpayments-sig` or `X-MaxelPay-Signature`).
2. **Status Filter**: Ensures payment status is `finished`/`confirmed`/`paid`.
3. **UUID Extraction**: Extracts UUID from `order_id` (format: `RESELLER-{uuid}`).
4. **Server Creation**: Passes node, user, plan limits (CPU, RAM bytes, Disk bytes), hostname, and OS template to `ServerCreationService->handle()`. If daemon is offline, creates a local `Server` record with 30-day expiration.
5. **State Update**: Updates `ResellerPaymentLink` status to `paid`, stores `server_id` and `paid_at` timestamp.
6. **Financial Settlement**:
   - Calculates profit: if `own_inventory`, profit = `selling_price`; if `zero_cost`, profit = `markup_amount`.
   - Increments reseller's `ResellerCoinBalance` (`balance += profitAmount`).
   - Creates a `ResellerTransaction` audit entry with type `earnings_credit`.

#### D. Crypto Withdrawal & Admin Approval Flow ([ResellerController.php:L304-L372](file:///d:/Downloads/panel-main/panel-main/app/Http/Controllers/Client/Reseller/ResellerController.php#L304-L372) & [AdminResellerController.php:L113-L209](file:///d:/Downloads/panel-main/panel-main/app/Http/Controllers/Admin/AdminResellerController.php#L113-L209))
1. **Request Submission**:
   - Validates minimum coin threshold (USDT: 10, SOL: 0.05, BTC: 0.0002, LTC: 0.15, ETH: 0.003 ~ $10 USD).
   - Checks available balance (`balance - locked_balance`).
   - Increases `locked_balance += amount`.
   - Creates `ResellerWithdrawal` (status: `pending`) and `ResellerTransaction` (`withdrawal_locked`).
2. **Admin Approval**:
   - Admin enters blockchain `tx_hash`.
   - Deducts from both `balance` and `locked_balance`: `balance -= amount`, `locked_balance -= amount`.
   - Sets status to `approved`, stores `tx_hash` and `admin_notes`.
   - Logs `ResellerTransaction` (`withdrawal_completed`, negative amount).
3. **Admin Rejection**:
   - Admin enters rejection reason in `admin_notes`.
   - Reverts locked balance: `locked_balance -= amount`.
   - Sets status to `rejected`.
   - Logs `ResellerTransaction` (`withdrawal_refunded`).

---

### 3.6 Frontend Architecture & UI Components

#### 1. TypeScript API Layer
- **[reseller.ts](file:///d:/Downloads/panel-main/panel-main/resources/scripts/api/reseller.ts)**: Type interfaces (`CoinBalance`, `ResellerOverviewResponse`, `ResellerPlanConfig`, `PaymentLink`, `ResellerWithdrawal`) and Axios HTTP calls for client reseller functions.
- **[reseller.ts (admin)](file:///d:/Downloads/panel-main/panel-main/resources/scripts/api/admin/reseller.ts)**: Interfaces (`AdminResellerUser`, `AdminWithdrawalItem`) and calls for admin partner management and payout approvals.

#### 2. React Dashboard Containers
- **[ResellerHubContainer.tsx](file:///d:/Downloads/panel-main/panel-main/resources/scripts/components/reseller/ResellerHubContainer.tsx)**: Main tabbed client portal displaying:
  - Multi-currency crypto wallet cards (`USDT`, `SOL`, `BTC`, `LTC`, `ETH`) showing total, locked, and available balances.
  - Payment Link Generator modal & table of generated links with status badges.
  - Interactive Plan Markup editor with real-time zero-cost 30% cap validation feedback.
  - Withdrawal request form with address validation & transaction history ledger.
- **[PublicPaymentCheckoutContainer.tsx](file:///d:/Downloads/panel-main/panel-main/resources/scripts/components/reseller/PublicPaymentCheckoutContainer.tsx)**: Public customer checkout view showcasing VPS specs, reseller branding, payment gateway redirect buttons, or account password form.
- **[AdminResellerManagementContainer.tsx](file:///d:/Downloads/panel-main/panel-main/resources/scripts/components/admin/reseller/AdminResellerManagementContainer.tsx)**: Admin management interface to toggle reseller rights, switch model types (`zero_cost` vs `own_inventory`), inspect partner balances, and process pending crypto withdrawals with TxID input.

---

## 4. Summary Matrix of Reseller Data Contracts

```
+---------------------------------------------------------------------------------------------------+
|                                     RESELLER DATA FLOW MATRIX                                     |
+----------------------+--------------------------+-----------------------+-------------------------+
| Action               | Input Data               | Database Impact       | Ledger Output           |
+----------------------+--------------------------+-----------------------+-------------------------+
| Grant Reseller Access| user_id, plan_type       | users.is_reseller=1   | N/A                     |
| Save Plan Markup     | plan_id, markup_percent  | reseller_plans upsert | Custom selling price    |
| Create Payment Link  | plan, node, template, coin| reseller_payment_links| Link status=pending     |
| Client Pays Link     | Webhook / Direct submit  | servers (new record), | reseller_coin_balances  |
|                      |                          | link status=paid      | balance += profit       |
| Request Withdrawal   | coin, amount, wallet     | reseller_withdrawals, | reseller_coin_balances  |
|                      |                          | status=pending        | locked_balance += amt   |
| Admin Approves Payout| withdrawal_id, tx_hash   | status=approved,      | balance -= amt,         |
|                      |                          | tx_hash recorded      | locked_balance -= amt   |
| Admin Rejects Payout | withdrawal_id, reason    | status=rejected,      | locked_balance -= amt   |
|                      |                          | admin_notes recorded  | (available restored)    |
+----------------------+--------------------------+-----------------------+-------------------------+
```

---
*Document generated for architectural reference and project documentation.*
