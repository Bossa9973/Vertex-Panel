# Storefront Redesign

## What changed

### Design
- **Color**: killed AI-purple (`#7c3aed`). New accent: electric teal `#00d4aa` on pure black `#080808`. Single accent, used nowhere it isn't earned.
- **Layout**: left-aligned split hero — copy left, terminal widget right. No centered soup.
- **Plans**: replaced 3-column card grid with a clean table (PLAN / CPU / RAM / STORAGE / PRICE). Compact, scannable, developer-appropriate. Mobile falls back to vertical cards.
- **Steps**: borderless grid cells sharing a single outer border. No individual card elevation.
- **Nav**: 60px tall (was 64px), brand mark is a solid teal square (no glow shadow).

### Copy (stop-slop applied)
| Before | After |
|--------|-------|
| "Deploy **powerful** virtual servers in seconds" | "Deploy your VPS in seconds." |
| "No setup required. Crypto payments accepted." | "Pay with crypto, get root access instantly." |
| "Your VPS is live before you close the payment tab." | "Your server is running before you close the payment tab." |
| "Delivered in under 2 minutes" (modal sub) | "Deployed in under 2 minutes" |
| "Waiting for payment…" | "Waiting for payment" |
| "Your VPS has been provisioned and is starting up." | "Your VPS is provisioned and starting up." |
| "No plans available yet / Check back soon." | "No plans yet / Check back soon." |

### Components / Dependencies
- **Icons**: migrated from `lucide-react` → `@phosphor-icons/react`
- **Default brand color**: `#7c3aed` (purple) → `#00d4aa` (teal). Resellers override via `NEXT_PUBLIC_BRAND_COLOR` env var.

### Files changed
- [`globals.css`](file:///d:/Downloads/Vertex-Panel/reseller-storefront/app/globals.css) — full rewrite
- [`page.tsx`](file:///d:/Downloads/Vertex-Panel/reseller-storefront/app/page.tsx) — full rewrite
- [`layout.tsx`](file:///d:/Downloads/Vertex-Panel/reseller-storefront/app/layout.tsx) — default color + metadata copy

## What's still needed
- `.env.local` with `VERTEX_API_URL` + `RESELLER_TOKEN` for the plans API to stop returning 503
- 3 Laravel backend routes on Vertex Panel (not done yet)
