# Storefront — Live at localhost:3000

````carousel
![Full page — top half](file:///C:/Users/User/.gemini/antigravity-ide/brain/94b12b32-4fca-4fa4-90a1-60874347813f/storefront_full_1789205562809.png)
<!-- slide -->
![Scrolled — steps + CTA + footer](file:///C:/Users/User/.gemini/antigravity-ide/brain/94b12b32-4fca-4fa4-90a1-60874347813f/storefront_scrolled_1789205569807.png)
````

The **503 "Could not load plans"** is expected — no `.env.local` is configured yet. Once you add `VERTEX_API_URL` and `RESELLER_TOKEN`, the plan cards will render.

---

## Next steps

### 1. Connect to Vertex

Create `reseller-storefront/.env.local`:

```env
VERTEX_API_URL=https://vertexnodes.net
RESELLER_TOKEN=rsl_pub_YOUR_TOKEN_HERE
NEXT_PUBLIC_BRAND_NAME=Your Brand
NEXT_PUBLIC_BRAND_COLOR=#7c3aed
NEXT_PUBLIC_PANEL_URL=https://vertexnodes.net
```

Then restart: `npm run dev`

### 2. Backend endpoints needed on Vertex side

The storefront calls these Laravel routes (still to be built):

| Method | Route | Auth |
|---|---|---|
| `GET` | `/api/client/reseller/store/plans` | `X-Reseller-Token` header |
| `POST` | `/api/client/reseller/store/order` | `X-Reseller-Token` header |
| `GET` | `/api/client/pay/{uuid}/status` | `X-Reseller-Token` header |

Want me to build those Laravel routes next?
