# Reseller Storefront — Product Design Plan

> **The concept**: Each reseller gets a lightweight, white-label storefront they run on their own domain.  
> Vertex powers everything behind the scenes — API keys, provisioning, payments — none of it is exposed to the reseller or their customers.

---

## The Big Picture

```
  reseller's domain                   Vertex backend (hidden)
  ─────────────────                   ───────────────────────

  store.resellerbrand.com             api.vertexnodes.net
        │                                     │
        │  (branded storefront)               │  (your servers, payments,
        │  name, color, logo only             │   provisioning, wallets)
        │                                     │
        └──── public reseller token ─────────►│
              (read-only, scoped)             │
                                             │
  Customer visits → sees plans → pays ───────┘
  Server provisioned by Vertex
  Customer redirected to manage their VPS
```

---

## Part 1: The Reseller Experience

### What the Reseller Gets

When you approve a reseller and configure their account, the system generates:

1. **A public storefront token** — a scoped, read-only key unique to that reseller. It can only list their plans and trigger payment link creation. Nothing else. It cannot touch admin functions, see API keys, or access other resellers' data.

2. **A config snippet** — either a single JS file embed or a downloadable static site, pre-filled with their token, brand name, and color.

3. **Their storefront URL** — one of three options (see deployment section below).

### What They Can Customize

Simple panel inside the Vertex dashboard (`/reseller/branding`):

| Setting | Example |
|---|---|
| Brand name | "HostPro" |
| Tagline | "Instant VPS — No Setup Required" |
| Primary color | #7c3aed (purple) |
| Logo URL | https://their-site.com/logo.png |
| Support link | https://t.me/their_telegram |
| Custom domain | store.hostpro.com |

That's it. They don't touch anything else. No gateway keys, no node selection controls, no backend settings.

### What They Cannot Touch

- Payment gateway API keys (NOWPayments, Maxelpay)
- Node selection (they pick during link creation in their Vertex reseller hub, not the storefront config)
- Base prices or other resellers' pricing
- Backend infrastructure
- Other customers' data

---

## Part 2: The Three Deployment Options

### Option 1 — Vertex-Hosted Subdomain (Easiest, Recommended for New Resellers)

Vertex hosts the storefront. No deployment needed.

```
URL: vertexnodes.net/store/hostpro
  or store.vertexnodes.net/hostpro
```

Reseller just shares that link. Zero technical effort on their part.

---

### Option 2 — Custom Domain via CNAME (Best for Established Resellers)

Reseller adds a DNS record on their domain:

```
CNAME   store.hostpro.com  →  stores.vertexnodes.net
```

Vertex automatically issues an SSL certificate (via Let's Encrypt or Cloudflare).

From that point, `store.hostpro.com` loads their branded storefront, powered by Vertex. Their customers never see "vertexnodes.net" anywhere.

---

### Option 3 — Self-Hosted Embed (For Resellers With Existing Websites)

Reseller gets a `<script>` tag they paste into any existing website:

```html
<script src="https://stores.vertexnodes.net/embed.js"
        data-token="rsl_pub_abc123"
        data-color="#7c3aed"
        data-name="HostPro">
</script>
```

This renders the storefront widget inline on their own site — their blog, their landing page, wherever they want it. Everything still runs on Vertex's backend.

---

## Part 3: What the Storefront Looks Like

The storefront is **one page**, dead simple. No login wall, no account creation required to browse.

```
┌──────────────────────────────────────────────────────────┐
│  🟣 HostPro                          [Support] [My Servers]│
│  "Instant VPS — No Setup Required"                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │  Starter      │ │  Standard    │ │  Pro         │    │
│  │  2 vCPU       │ │  4 vCPU      │ │  8 vCPU      │    │
│  │  2GB RAM      │ │  8GB RAM     │ │  16GB RAM    │    │
│  │  40GB SSD     │ │  80GB SSD    │ │  200GB SSD   │    │
│  │               │ │              │ │              │    │
│  │  $8 / month   │ │  $14 / month │ │  $28 / month │    │
│  │  [Order Now]  │ │  [Order Now] │ │  [Order Now] │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                          │
│  ✅ Instant delivery   🔒 Crypto payments   📡 99.9% uptime│
└──────────────────────────────────────────────────────────┘
```

Prices shown are **the reseller's custom prices** — not Vertex's base prices.

---

## Part 4: The Customer Purchase Flow

```
Step 1: Customer visits store.hostpro.com
        → Sees plans with HostPro branding, HostPro prices
        → No mention of Vertex (or a subtle "Powered by Vertex" footer — your choice)

Step 2: Customer clicks "Order Now" on the Standard plan
        → Small form appears:
            • Server name (e.g. "My Game Server")
            • Choose OS (Ubuntu, Debian, etc.)
            • Choose payment coin (USDT, SOL, BTC, LTC, ETH)
            • Email address (for delivery notification)

Step 3: Customer clicks "Continue to Payment"
        → Storefront calls Vertex API using reseller's public token
        → Vertex creates a payment link internally (reseller never sees this step)
        → Customer is redirected to the payment gateway (NOWPayments or Maxelpay)
        → They scan a QR code / send crypto to a wallet address

Step 4: Payment confirmed (1-5 minutes on-chain)
        → Vertex backend receives gateway webhook
        → Server is auto-provisioned on the Proxmox node
        → Customer's email receives delivery notification

Step 5: Customer clicks link in email (or is redirected automatically)
        → They land on Vertex panel (vertexnodes.net) to manage their server
        → OR: they see server details directly on the storefront's order confirmation page
```

---

## Part 5: How End-Clients Access Their Servers

This is the key design decision. Three approaches:

---

### Approach A — Redirect to Vertex Panel (Simplest)

After payment:
- Customer is redirected to `vertexnodes.net/login`
- They create a Vertex account (or log in if they already have one)
- Their server appears in the dashboard

**Pros**: No extra work. Full panel features (VNC, metrics, backups).  
**Cons**: Customer sees "Vertex" branding. Reseller loses full white-label feel.

---

### Approach B — Storefront Order Page (Recommended White-Label)

After payment:
- Storefront shows an order confirmation screen:
  ```
  ✅ Your server is ready!
  
  Server Name: My Game Server
  IP Address: 185.xxx.xxx.xxx
  Username: root
  Password: ••••••••  [Reveal] [Copy]
  
  [Manage My Server →]  ← links to Vertex panel, but reseller can relabel this
  ```

- Customer can see their credentials immediately on the storefront
- "Manage My Server" link goes to Vertex panel — but this can be labeled as "HostPro Control Panel" pointing to a custom domain CNAME of the Vertex panel

**Pros**: Feels fully white-label. Customer gets everything they need on one screen.  
**Cons**: Credentials shown in browser (fine if HTTPS, which it always is).

---

### Approach C — Full White-Label Panel (Most Work, Most Control)

Reseller points a subdomain at the Vertex panel itself:

```
CNAME: panel.hostpro.com → vertexnodes.net
```

The Vertex panel already supports custom branding. Customers log in at `panel.hostpro.com` and see HostPro branding throughout. They never see "Vertex" unless they look at the SSL certificate.

**Pros**: Completely seamless white-label experience.  
**Cons**: Requires DNS setup from reseller. More configuration on Vertex's end per reseller.

---

## Part 6: Security Model

### The Public Token

Resellers get a `rsl_pub_` prefixed token that can **only**:
- List that reseller's active plans with their custom prices
- Create a payment link (triggering a checkout)
- Check the status of an existing payment link by UUID

It **cannot**:
- Create or modify plans
- Access balances or transaction history
- Approve/reject anything
- Access any other reseller's data
- See the reseller's wallet addresses or crypto balances

### What the Customer Sees in Network Requests

Even in browser dev tools, the customer sees requests going to `api.vertexnodes.net` with only the public token. There's no API key, no backend credentials, no internal pricing data. The actual NOWPayments/Maxelpay keys live only on Vertex's server and are never sent to the browser.

### Reseller Isolation

If a reseller's public token is leaked or scraped:
- Worst case: someone creates a payment link for that reseller's plans (and pays it — which just earns the reseller money)
- They cannot impersonate another reseller
- They cannot access the Vertex admin
- The token can be rotated from the Vertex admin panel instantly

---

## Part 7: What Resellers See in Their Hub

Inside the existing Vertex reseller portal (`/reseller`), they see:

```
┌─────────────────────────────────────────────────────────┐
│ Reseller Hub                                            │
├──────────────┬──────────────┬──────────────┬───────────┤
│ 💰 Balances  │ 🔗 Links     │ 📐 Plans     │ 💸 Payouts│
├──────────────┴──────────────┴──────────────┴───────────┤
│                                                         │
│  Storefront URL:                                        │
│  store.vertexnodes.net/hostpro          [Copy] [Config] │
│                                                         │
│  Custom Domain:  store.hostpro.com  ✅ Active           │
│                                                         │
│  Total Sales: 42  |  Active Servers: 38  |  MRR: $76   │
│                                                         │
│  USDT Balance:  $142.50  (available: $132.50)           │
│  SOL Balance:   0.72                                    │
└─────────────────────────────────────────────────────────┘
```

They see their business metrics. They see their storefront link. That's their whole world — they don't need to know anything else about Vertex's infrastructure.

---

## Part 8: Reseller Onboarding Flow

```
1. Reseller contacts you
   → You agree on model type (zero_cost or own_inventory)
   → If own_inventory: you agree on wholesale terms separately

2. You go to Admin → Resellers → Find User → Enable Reseller
   → Set model type
   → Optionally set notes ("Wholesale deal: 50 nodes @ $7/mo")

3. System auto-generates their public storefront token

4. Reseller goes to /reseller/branding in their account
   → Sets name, color, logo, support link
   → Configures their custom domain (or uses the Vertex-hosted URL)

5. Reseller goes to /reseller/plans
   → Sets their custom prices per plan

6. Reseller shares their store URL with their customers
   → They start selling
```

---

## Summary: What Makes This Clean

| Problem | How It's Solved |
|---|---|
| Reseller could expose API keys | Public token is scoped — API keys never leave Vertex's server |
| Reseller needs a dev to set this up | Embed script option = paste one line into any website |
| Customer sees "Vertex" branding | CNAME options + branded storefront make it fully white-label |
| Reseller oversells / price gouges | 30% cap enforced server-side, not by the storefront |
| Reseller could mess with payment flow | They can't — gateway keys, webhook endpoints, provisioning all server-side |
| Customer can't find their server | Delivery email + order confirmation page with credentials |

---

## Open Decisions

1. **Which deployment option is the default?** Recommend starting with the Vertex-hosted subdomain (zero friction) + CNAME as the upgrade path.

2. **Do customers create Vertex accounts?** Or do you show credentials on the storefront order page and let them log into Vertex panel when they need advanced management?

3. **"Powered by Vertex" footer?** White-label can be 100% clean or have a subtle attribution. Your call.

4. **Does the storefront have a login section?** So repeat customers can log in and see their previous orders without going to the Vertex panel. Or do you just redirect to Vertex panel for that?
