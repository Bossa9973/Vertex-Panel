# Vertex Reseller Panel — Business Plan

---

## 1. Who's Involved

There are three parties in this system:

```
┌─────────────────┐     grants access     ┌─────────────────┐
│   YOUR COMPANY  │ ──────────────────────► │    RESELLER     │
│  (Vertex Host)  │                         │  (Your partner) │
└─────────────────┘                         └────────┬────────┘
                                                     │ sells to
                                                     ▼
                                            ┌─────────────────┐
                                            │   END CLIENT    │
                                            │ (Their customer)│
                                            └─────────────────┘
```

- **Your Company** — owns the servers, the hardware, the platform. You set base prices, approve reseller partners, and handle crypto payouts.
- **Reseller** — a partner (could be a freelancer, a small hosting company, a Telegram seller, anyone) who sells VPS to their own customers using your infrastructure. They do zero setup, zero server management.
- **End Client** — the reseller's customer. They buy a VPS, get it delivered instantly, and manage it through your panel. They may or may not know it's powered by Vertex Host.

---

## 2. The Two Business Models

You offer resellers a choice of two operating models. This is the core business distinction.

---

### Model A — Zero Cost (Default)

> *"I don't own any servers. I just mark up yours and keep the margin."*

**How it works:**
- Reseller pays nothing upfront. No commitment.
- Your company sets a base price for each VPS plan (e.g. $10/month).
- The reseller sets a markup percentage on top (e.g. 20%).
- End client pays the marked-up price ($12/month).
- Your company takes the $10 base. Reseller pockets the $2 margin.

**The cap:**
- Markup is strictly capped at **30%**. This protects your brand from price gouging and keeps resellers competitive. A $10 plan can go no higher than $13 for end clients.

**Who this suits:**
- New resellers, Telegram resellers, affiliate-style partners — anyone who wants to start selling with zero upfront risk.

---

### Model B — Own Inventory

> *"I've bought or reserved capacity from you in bulk. I set my own price."*

**How it works:**
- Reseller has pre-purchased or reserved node capacity (wholesale deal, bulk prepay, or a negotiated arrangement with you).
- They set any price they want — $20, $50, $100/month — no cap.
- When an end client pays, **100% of the checkout amount** goes to the reseller's balance.
- They already paid you wholesale, so no deduction happens on each sale.

**Who this suits:**
- Established resellers, hosting companies buying in bulk, white-label partners who want full pricing control.

---

## 3. How Money Flows — Full Walkthrough

Let's trace a complete transaction for each model.

---

### Scenario A: Zero Cost Reseller Sale

| Step | What Happens | Money Movement |
|---|---|---|
| 1 | Reseller sets 20% markup on $10/mo plan | Plan now sells for **$12/mo** |
| 2 | Reseller creates a payment link (picks server name, OS, node, crypto coin) | Link generated: `/pay/abc-xyz` |
| 3 | Reseller shares link with their customer | — |
| 4 | End client opens the link, clicks "Pay with Crypto" | — |
| 5 | Client pays **$12 USDT** on the payment gateway | $12 received by gateway |
| 6 | Gateway notifies your platform | — |
| 7 | Server is automatically created and delivered | VPS running in ~60 seconds |
| 8 | **$10** stays with your company (covers infrastructure) | Vertex keeps $10 |
| 9 | **$2** is credited to reseller's USDT balance | Reseller earns $2 |

---

### Scenario B: Own Inventory Reseller Sale

| Step | What Happens | Money Movement |
|---|---|---|
| 1 | Reseller sets custom price of $25/mo on the plan | Plan now sells for **$25/mo** |
| 2 | Creates payment link, shares with client | — |
| 3 | Client pays **$25 USDT** | $25 received |
| 4 | Server auto-provisioned | VPS running |
| 5 | **$25** fully credited to reseller's USDT balance | Reseller earns $25 |
| Note | Reseller already paid you wholesale (e.g. $8/mo per server). That payment was separate. | Vertex was paid separately |

---

## 4. The Full End-Client Journey

From the end client's perspective, here's what they experience:

```
① Receives a link from their seller
   e.g. "Here's your server payment link: vertexnodes.net/pay/abc-xyz"

② Opens the link in their browser
   They see:
   — Server name (e.g. "Game Server #1")
   — Hardware specs (4 vCPU / 8GB RAM / 100GB SSD)
   — OS template (e.g. Ubuntu 22.04)
   — Location (e.g. "Germany Node")
   — Price ($12/month USDT)
   — Sold by: [Reseller's Name]

③ Clicks "Pay with Crypto"
   Gets redirected to the payment gateway (NOWPayments or Maxelpay)
   Sees a wallet address or QR code
   Sends exactly $12 USDT

④ Payment confirmed on the blockchain
   (Usually 1-5 minutes depending on the coin)

⑤ Server is automatically created
   — Virtual machine spun up on the Proxmox node
   — OS installed from the template
   — Server appears in the client's panel account
   — Active for 30 days

⑥ Client logs into the panel
   — Sees their server listed
   — Can start/stop/reboot it
   — Can access the VNC console
   — Can view CPU/RAM/disk usage
   — Expiry countdown shows 30 days remaining
```

No human on your side needs to touch anything between steps ③ and ⑥. It's fully automated.

---

## 5. The Crypto Balance & Payout System

### How Reseller Earnings Accumulate

Every time a client pays a reseller's payment link, the reseller's balance in the **exact cryptocurrency** they specified grows. The balances are tracked per-coin:

| Coin | Example Balance |
|---|---|
| USDT | $142.50 |
| SOL | 0.72 |
| BTC | 0.00041 |
| LTC | 0.00 |
| ETH | 0.00 |

### Two Balance Types

Every coin balance has two states:
- **Available** — money the reseller can freely withdraw right now
- **Locked** — money that's been requested for withdrawal and is being processed

This prevents a reseller from double-spending (requesting two withdrawals of the same funds simultaneously).

### Requesting a Withdrawal

1. Reseller goes to the Withdrawals tab
2. Selects which coin, how much, and their wallet address
3. Minimum threshold: **~$10 USD equivalent** per withdrawal (to avoid dust transactions that cost more in gas fees than they're worth)
4. The amount is immediately **locked** from their available balance
5. A withdrawal request appears in the admin queue

### Admin Processes the Payout

1. Admin sees the pending withdrawal in the admin panel
2. Admin manually sends the crypto from the company wallet to the reseller's wallet
3. Admin enters the **blockchain transaction hash (TxID)** to prove the payment was sent
4. System marks the withdrawal as **approved**, deducts from reseller's balance permanently
5. If admin rejects (wrong amount, suspicious request, etc.), the locked balance is **returned** to the reseller's available balance

### Full Audit Trail

Every financial event is recorded permanently:
- `earnings_credit` — when a client pays a link
- `withdrawal_locked` — when a withdrawal is requested
- `withdrawal_completed` — when admin approves and sends payment
- `withdrawal_refunded` — when admin rejects and unlocks funds

---

## 6. Pricing Rules & Anti-Gouging

### Why the 30% Cap on Zero-Cost?

Without a cap, a zero-cost reseller could theoretically charge $100 for a $10 plan. This would:
- Make your platform look expensive compared to competitors
- Damage your brand when end clients research pricing
- Create chargebacks or disputes directed at your platform name

The 30% ceiling keeps resellers competitive and protects your market position.

### Own Inventory Has No Cap

Resellers who've already paid you wholesale can price however they want — because you've already been paid. They carry the inventory risk, so they earn the pricing freedom.

---

## 7. Reseller Onboarding & Access Control

### How Someone Becomes a Reseller

1. They contact you (Telegram, email, etc.)
2. You discuss which model fits them (zero_cost or own_inventory)
3. You go into the admin panel → Resellers section
4. Find their account, toggle "Reseller Access: ON"
5. Select their model type
6. Optionally write internal notes (e.g. "Bulk deal: 20 nodes prepaid, agreed $8/server/mo wholesale")

Resellers **cannot** self-register as resellers. This is gated. You control who can sell on your platform.

### Revoking Access

If a reseller violates terms, abandons their clients, or you end the partnership:
- Toggle "Reseller Access: OFF" in admin panel
- Their payment links stop working immediately
- Their existing clients' servers continue running (they were already provisioned and paid for)
- Their unspent balance stays in their account until they withdraw it

---

## 8. Recurring Revenue Model

### 30-Day Billing Cycles

Every VPS sold through a reseller link is active for **30 days**. After that, clients need to renew.

### Who Benefits from Renewals?

When a client renews (pays again for another month), the **same payment link logic applies** — another sale is recorded, another profit split happens. Both the reseller and your company benefit from every renewal.

### Monthly Recurring Revenue (MRR)

If a reseller has 20 active clients paying $12/month each:
- Reseller generates **$40/month** (20 × $2 markup)
- Your company generates **$200/month** (20 × $10 base) from that one reseller's portfolio
- As their client base grows, so does the MRR for both sides

---

## 9. Why Crypto Only?

### No Chargebacks

Credit card chargebacks are a major problem in the hosting industry — clients claim "I never authorized this" and the payment processor reverses the funds weeks later. With crypto, once a transaction is confirmed on the blockchain, it's **irreversible**. Resellers and your company are protected from this risk.

### Global Reach

Resellers can operate anywhere in the world without dealing with PayPal regional restrictions, bank wire fees, or currency conversion. A reseller in Turkey, Nigeria, or Brazil can sell in USDT with zero friction.

### Multi-Coin Flexibility

Clients can pay in USDT, SOL, BTC, LTC, or ETH. Resellers earn in whichever coin the payment link is denominated in. They can diversify across coins naturally.

---

## 10. The Business Risk Distribution

| Risk | Who Carries It |
|---|---|
| Server hardware failure | Your company |
| Node goes offline | Your company |
| Client doesn't pay | Neither (crypto is prepaid, no credit extended) |
| Reseller disappears | Your company (clients' servers keep running, already paid) |
| Crypto price volatility | Reseller (earns in crypto, not USD) |
| Gateway downtime | Falls back automatically to next gateway |
| Reseller overcharges clients | Capped at 30% for zero-cost model |

---

## 11. Edge Cases & How They're Handled

| Situation | What Happens |
|---|---|
| Client pays but server creation fails (node offline) | Server record is created locally in a pending state; provisioned when node comes back online |
| Gateway sends payment confirmation twice | System ignores the second notification — link is already marked paid |
| Reseller requests withdrawal but then makes another sale before admin approves | Only available balance (total minus locked) can be used — no double spend |
| Admin rejects a withdrawal | Locked funds are returned to reseller's available balance instantly |
| Reseller's client wants a refund | There is no refund mechanism — crypto is irreversible; reseller handles it with their client directly |
| Payment link expires before client pays | Link marked as expired; reseller creates a new one |

---

## 12. Summary of Value Proposition

**For you (Vertex Host):**
- Zero additional infrastructure needed — same nodes, same platform
- New revenue stream from reseller sales (base price on every transaction)
- Resellers bring their own clients — you grow your user base without marketing
- All payments are crypto — no chargebacks, no payment processor fees on the base split

**For resellers:**
- Zero setup cost — no servers to buy, no billing system to build, no support infrastructure
- Instant delivery — their clients get a working VPS in under 2 minutes
- Passive income from renewals
- Crypto earnings — no PayPal holds, no bank delays
- White-label branding — checkout page shows their name

**For end clients:**
- Get a real VPS instantly after paying
- Manage it through a professional panel (power control, VNC, metrics)
- Pay in the crypto of their choice
