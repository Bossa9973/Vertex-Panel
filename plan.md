# Pterodactyl Auto-Deploy System — Architecture Plan

> **Role**: Software & Backend Engineer  
> **Scope**: Full system design for automated Pterodactyl Panel + Wings deployment  
> **Stack**: Proxmox → Convoy → Custom Dashboard → Cloud-init → Cloudflare Tunnel → Pterodactyl

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Breakdown](#2-component-breakdown)
3. [Full Request Flow](#3-full-request-flow)
4. [Directory & File Structure](#4-directory--file-structure)
5. [Layer 1 — Dashboard Frontend](#5-layer-1--dashboard-frontend)
6. [Layer 2 — Backend API](#6-layer-2--backend-api)
7. [Layer 3 — Cloud-Init Script](#7-layer-3--cloud-init-script)
8. [Layer 4 — Cloudflare Tunnel Setup](#8-layer-4--cloudflare-tunnel-setup)
9. [Layer 5 — Pterodactyl Install & API Wiring](#9-layer-5--pterodactyl-install--api-wiring)
10. [Layer 6 — Credential Delivery](#10-layer-6--credential-delivery)
11. [Database Schema](#11-database-schema)
12. [Critical Flaws & How to Avoid Them](#12-critical-flaws--how-to-avoid-them)
13. [Execution Checklist](#13-execution-checklist)

---

## 1. System Overview

The goal is: a client fills in a form on your dashboard, hits deploy, and gets a fully working
Pterodactyl Panel + Wings installation with no IPv4 required, delivered via Cloudflare Tunnel.
No human touches the server after provisioning.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT BROWSER                           │
│   Fills form → Panel domain, CF Tunnel token, admin details     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /api/deploy
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      YOUR BACKEND (Node.js)                     │
│   Validates input → injects vars → calls Convoy API             │
└────────────┬───────────────────────────────┬────────────────────┘
             │                               │
             │ Convoy REST API               │ Stores deploy state
             ▼                               ▼
┌────────────────────────┐        ┌──────────────────────┐
│   CONVOY + PROXMOX     │        │      DATABASE        │
│   Provisions VM        │        │  servers, deploys,   │
│   Attaches cloud-init  │        │  credentials table   │
└────────────┬───────────┘        └──────────────────────┘
             │ VM first boot
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUD-INIT (on the VM)                      │
│                                                                 │
│  Step 0 ── Install cloudflared, start tunnel                    │
│  Step 1 ── Run pterodactyl-installer/installers/panel.sh        │
│  Step 2 ── Generate API key via artisan                         │
│  Step 3 ── Create Location + Node via Panel API                 │
│  Step 4 ── Pull config.yml from Panel API                       │
│  Step 5 ── Run pterodactyl-installer/installers/wings.sh        │
│  Step 6 ── Start Wings, verify connection                       │
│  Step 7 ── POST credentials to your webhook                     │
└────────────┬────────────────────────────┬───────────────────────┘
             │                            │
             │ Tunnel (no IPv4 needed)    │ Webhook POST
             ▼                            ▼
┌────────────────────────┐    ┌───────────────────────────────────┐
│   CLOUDFLARE NETWORK   │    │  YOUR BACKEND (webhook receiver)  │
│   Routes panel.domain  │    │  Saves creds, emails client       │
│   → VM localhost:80    │    └───────────────────────────────────┘
│   Routes wings port    │
│   → VM localhost:8080  │
└────────────────────────┘
```

---

## 2. Component Breakdown

| Component | Technology | Responsibility |
|---|---|---|
| **Dashboard UI** | React / Next.js | Order form, status polling, credential display |
| **Backend API** | Node.js + Express | Validation, template injection, Convoy calls, webhook receiver |
| **Template Engine** | String interpolation | Replaces `##VAR##` placeholders in cloud-init YAML |
| **Convoy** | Convoy API | VM lifecycle — create, attach user-data, boot |
| **Proxmox** | Proxmox VE | Hypervisor — runs VMs, cloud-init, snapshots |
| **Cloud-init** | YAML + bash | First-boot automation — everything from tunnel to Wings |
| **Cloudflared** | Cloudflare Tunnel | Tunnels HTTP/HTTPS to VM with no public IPv4 |
| **Bird Installer** | pterodactyl-installer | Handles Panel + Wings package install and config |
| **Pterodactyl API** | REST (application API) | Creates location, node, pulls Wings config.yml |
| **Database** | PostgreSQL | Stores server state, deploy logs, credentials |
| **Email** | Nodemailer / Resend | Delivers credentials to client after install |

---

## 3. Full Request Flow

```
CLIENT                  BACKEND               CONVOY/PROXMOX           VM (cloud-init)
  │                        │                        │                        │
  │── POST /api/deploy ──► │                        │                        │
  │   {cf_token, domain,   │                        │                        │
  │    admin details,      │                        │                        │
  │    node specs}         │                        │                        │
  │                        │                        │                        │
  │                        │─ validate inputs ──►   │                        │
  │                        │─ generate passwords    │                        │
  │                        │─ build cloud-init YAML │                        │
  │                        │─ POST /servers ──────► │                        │
  │                        │   {template, userdata} │                        │
  │                        │                        │── provision VM ──────► │
  │◄── 202 Accepted ───────│                        │                        │
  │    {deploy_id}         │                        │   cloudflared install  │
  │                        │                        │   tunnel starts        │
  │                        │                        │   panel install        │
  │── GET /api/deploy/:id  │                        │   artisan key gen      │
  │   (polling)            │                        │   API → location+node  │
  │◄── {status: running}   │                        │   pull config.yml      │
  │                        │                        │   wings install        │
  │                        │                        │   wings starts         │
  │                        │◄── POST /webhook ─────────────────────────────│
  │                        │    {server_id, creds}  │                        │
  │                        │─ save to DB            │                        │
  │                        │─ send email to client  │                        │
  │◄── {status: complete,  │                        │                        │
  │     panel_url, creds}  │                        │                        │
```

---

## 4. Directory & File Structure

```
project/
├── frontend/
│   ├── pages/
│   │   ├── deploy/
│   │   │   └── pterodactyl.tsx     # Order form
│   │   └── servers/
│   │       └── [id].tsx            # Status + credential page
│   └── components/
│       ├── DeployForm.tsx
│       ├── StatusPoller.tsx
│       └── CredentialCard.tsx
│
├── backend/
│   ├── routes/
│   │   ├── deploy.ts               # POST /api/deploy
│   │   ├── status.ts               # GET /api/deploy/:id
│   │   └── webhook.ts              # POST /api/webhooks/install-complete
│   ├── services/
│   │   ├── convoy.ts               # Convoy API client
│   │   ├── templateEngine.ts       # ##VAR## injection
│   │   ├── passwordGen.ts          # Secure random passwords
│   │   └── mailer.ts               # Credential email sender
│   ├── db/
│   │   ├── schema.sql
│   │   └── queries.ts
│   └── templates/
│       └── pterodactyl-full.yml    # Cloud-init master template
│
└── proxmox/
    └── base-template-setup.sh      # One-time Proxmox setup notes
```

---

## 5. Layer 1 — Dashboard Frontend

The form must collect everything needed before the user hits deploy.
No config step happens after this — it all goes into cloud-init at deploy time.

### Form Fields

```typescript
// frontend/components/DeployForm.tsx

interface PterodactylDeployConfig {
  // Cloudflare
  cf_tunnel_token: string;     // From CF Zero Trust → Tunnels → token
  panel_domain: string;        // e.g. panel.theirdomain.com
  wings_domain: string;        // can be same or e.g. wings.theirdomain.com

  // Admin account
  admin_email: string;
  admin_username: string;
  admin_firstname: string;
  admin_lastname: string;
  admin_password?: string;     // autogenerated if blank

  // Panel config
  timezone: string;            // default: UTC
  db_password?: string;        // autogenerated if blank

  // Node config
  node_name: string;           // e.g. "Node 1"
  node_memory_mb: number;      // e.g. 4096
  node_disk_mb: number;        // e.g. 51200
  location_short: string;      // e.g. "EU-1"
}
```

### Client-side Validation Rules

```typescript
const validate = (form: PterodactylDeployConfig): string[] => {
  const errors: string[] = [];

  // CF token is ~200 char JWT — rough sanity check
  if (form.cf_tunnel_token.length < 100)
    errors.push("CF Tunnel token looks too short — copy the full token from the CF dashboard.");

  // Domain must not include protocol or trailing slash
  if (form.panel_domain.startsWith("http"))
    errors.push("Domain should not include http:// — just the hostname.");

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(form.panel_domain))
    errors.push("Panel domain doesn't look valid.");

  if (form.node_memory_mb < 512)
    errors.push("Node needs at least 512 MB RAM.");

  if (form.node_disk_mb < 5120)
    errors.push("Node needs at least 5 GB disk.");

  return errors;
};
```

### Status Polling Component

```typescript
// frontend/components/StatusPoller.tsx
// Polls every 10s after deploy is accepted

const [status, setStatus] = useState<"pending" | "running" | "complete" | "failed">("pending");

useEffect(() => {
  if (status === "complete" || status === "failed") return;

  const interval = setInterval(async () => {
    const res = await fetch(`/api/deploy/${deployId}`);
    const data = await res.json();
    setStatus(data.status);
    if (data.status === "complete") {
      setCredentials(data.credentials);
      clearInterval(interval);
    }
  }, 10_000);

  return () => clearInterval(interval);
}, [deployId, status]);
```

---

## 6. Layer 2 — Backend API

### Deploy Endpoint

```typescript
// backend/routes/deploy.ts

import { buildCloudInit } from "../services/templateEngine";
import { convoyClient } from "../services/convoy";
import { generatePassword } from "../services/passwordGen";
import { db } from "../db/queries";

app.post("/api/deploy", authenticate, async (req, res) => {
  const config = req.body as PterodactylDeployConfig;

  // Fill in any blanks before building the template
  const resolved = {
    ...config,
    admin_password:   config.admin_password   || generatePassword(),
    db_password:      config.db_password       || generatePassword(),
    db_root_password: generatePassword(),      // never exposed to client
    wings_db_password: generatePassword(),
  };

  // Generate a deploy ID and a secret the VM uses to authenticate its webhook
  const deployId = crypto.randomUUID();
  const deploySecret = generatePassword(32);

  // Build the cloud-init YAML
  const cloudInit = await buildCloudInit("pterodactyl-full.yml", {
    PANEL_FQDN:        resolved.panel_domain,
    WINGS_FQDN:        resolved.wings_domain || resolved.panel_domain,
    CF_TUNNEL_TOKEN:   resolved.cf_tunnel_token,
    ADMIN_EMAIL:       resolved.admin_email,
    ADMIN_USERNAME:    resolved.admin_username,
    ADMIN_FIRSTNAME:   resolved.admin_firstname,
    ADMIN_LASTNAME:    resolved.admin_lastname,
    ADMIN_PASSWORD:    resolved.admin_password,
    DB_PASSWORD:       resolved.db_password,
    DB_ROOT_PASSWORD:  resolved.db_root_password,
    WINGS_DB_PASSWORD: resolved.wings_db_password,
    TIMEZONE:          resolved.timezone || "UTC",
    NODE_NAME:         resolved.node_name,
    NODE_MEMORY:       String(resolved.node_memory_mb),
    NODE_DISK:         String(resolved.node_disk_mb),
    LOCATION_NAME:     resolved.location_short,
    DEPLOY_ID:         deployId,
    DEPLOY_SECRET:     deploySecret,
    WEBHOOK_URL:       process.env.WEBHOOK_BASE_URL + "/api/webhooks/install-complete",
    USE_SSL:           "false",   // CF handles TLS — never run LE inside tunnel
    ASSUME_SSL:        "false",
  });

  // Record the deploy before calling Convoy
  // so we have state even if Convoy call fails
  await db.createDeploy({
    id: deployId,
    user_id: req.user.id,
    status: "pending",
    secret: deploySecret,
    config: resolved,         // store resolved config (with generated passwords) encrypted
  });

  // Provision via Convoy
  const convoyServer = await convoyClient.servers.create({
    name: `ptero-${deployId.slice(0, 8)}`,
    template_id: process.env.PTERODACTYL_BASE_TEMPLATE_ID,
    user_data: cloudInit,
    // ... RAM, disk from resolved config
  });

  await db.updateDeploy(deployId, {
    convoy_server_id: convoyServer.id,
    status: "provisioning",
  });

  res.status(202).json({ deploy_id: deployId });
});
```

### Template Engine

```typescript
// backend/services/templateEngine.ts

import fs from "fs/promises";
import path from "path";

export async function buildCloudInit(
  templateName: string,
  vars: Record<string, string>
): Promise<string> {
  const templatePath = path.join(__dirname, "../templates", templateName);
  let template = await fs.readFile(templatePath, "utf-8");

  for (const [key, value] of Object.entries(vars)) {
    // Escape special shell chars in values before injecting into bash
    const safe = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    template = template.replaceAll(`##${key}##`, safe);
  }

  // Catch any unreplaced placeholders — means a required field was missing
  const remaining = template.match(/##[A-Z_]+##/g);
  if (remaining) {
    throw new Error(`Template has unreplaced variables: ${remaining.join(", ")}`);
  }

  return template;
}
```

### Convoy Client

```typescript
// backend/services/convoy.ts

const BASE = process.env.CONVOY_API_URL;   // e.g. https://convoy.yourdomain.com
const KEY  = process.env.CONVOY_API_KEY;

export const convoyClient = {
  servers: {
    async create(payload: ConvoyServerCreate) {
      const res = await fetch(`${BASE}/api/v1/servers`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Convoy server create failed: ${err}`);
      }

      return res.json();
    },
  },
};
```

### Webhook Receiver

```typescript
// backend/routes/webhook.ts

app.post("/api/webhooks/install-complete", async (req, res) => {
  const { deploy_id, deploy_secret, panel_url, admin_password,
          admin_email, node_id, node_status, error } = req.body;

  // Verify the secret the VM was given at deploy time
  const deploy = await db.getDeploy(deploy_id);
  if (!deploy || deploy.secret !== deploy_secret) {
    return res.status(401).json({ error: "Invalid deploy secret" });
  }

  if (error) {
    await db.updateDeploy(deploy_id, { status: "failed", error });
    return res.json({ ok: true });
  }

  await db.updateDeploy(deploy_id, {
    status: "complete",
    credentials: { panel_url, admin_email, admin_password, node_id, node_status },
  });

  // Email the client
  await sendCredentialEmail({
    to: admin_email,
    panel_url,
    admin_email,
    admin_password,
    node_id,
    note: node_status !== "online"
      ? "Wings may take 1-2 minutes to show as online in your panel."
      : undefined,
  });

  res.json({ ok: true });
});
```

---

## 7. Layer 3 — Cloud-Init Script

This is the master template file. Every `##VAR##` gets replaced by the backend before
being sent to Convoy. The script is written to `/root/ptero-install.sh` and executed
as a runcmd so the full output lands in `/var/log/ptero-install.log`.

```yaml
# backend/templates/pterodactyl-full.yml
#cloud-config

package_update: true
package_upgrade: true

packages:
  - curl
  - wget
  - git
  - python3
  - python3-yaml
  - jq
  - gnupg
  - ca-certificates
  - apt-transport-https

write_files:
  - path: /root/ptero-install.sh
    permissions: "0700"
    content: |
      #!/bin/bash
      set -euo pipefail

      # ── Injected variables ───────────────────────────────────────────────
      PANEL_FQDN="##PANEL_FQDN##"
      WINGS_FQDN="##WINGS_FQDN##"
      CF_TUNNEL_TOKEN="##CF_TUNNEL_TOKEN##"
      ADMIN_EMAIL="##ADMIN_EMAIL##"
      ADMIN_USERNAME="##ADMIN_USERNAME##"
      ADMIN_FIRSTNAME="##ADMIN_FIRSTNAME##"
      ADMIN_LASTNAME="##ADMIN_LASTNAME##"
      ADMIN_PASSWORD="##ADMIN_PASSWORD##"
      DB_PASSWORD="##DB_PASSWORD##"
      DB_ROOT_PASSWORD="##DB_ROOT_PASSWORD##"
      TIMEZONE="##TIMEZONE##"
      NODE_NAME="##NODE_NAME##"
      NODE_MEMORY="##NODE_MEMORY##"
      NODE_DISK="##NODE_DISK##"
      LOCATION_NAME="##LOCATION_NAME##"
      DEPLOY_ID="##DEPLOY_ID##"
      DEPLOY_SECRET="##DEPLOY_SECRET##"
      WEBHOOK_URL="##WEBHOOK_URL##"

      # ── Helpers ──────────────────────────────────────────────────────────
      log() { echo "[$(date '+%H:%M:%S')] $*"; }
      fail() {
        log "FATAL: $*"
        curl -sf -X POST "$WEBHOOK_URL" \
          -H "Content-Type: application/json" \
          -d "{\"deploy_id\":\"$DEPLOY_ID\",\"deploy_secret\":\"$DEPLOY_SECRET\",\"error\":\"$*\"}" || true
        exit 1
      }

      # ── Step 0: Cloudflare Tunnel ─────────────────────────────────────────
      log "[0/6] Installing Cloudflare Tunnel..."

      curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
        | gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg

      echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
        https://pkg.cloudflare.com/cloudflared any main" \
        > /etc/apt/sources.list.d/cloudflared.list

      apt-get update -q && apt-get install -y cloudflared

      cloudflared service install "$CF_TUNNEL_TOKEN" \
        || fail "cloudflared service install failed — is your tunnel token valid?"

      systemctl enable --now cloudflared
      sleep 10

      # Verify tunnel is actually connected before proceeding
      CF_STATUS=$(systemctl is-active cloudflared)
      [ "$CF_STATUS" = "active" ] || fail "cloudflared is not active after install (status: $CF_STATUS)"

      log "Cloudflare tunnel is up."

      # ── Step 1: Install Pterodactyl Panel ─────────────────────────────────
      log "[1/6] Installing Pterodactyl Panel..."

      INSTALLER_BASE="https://raw.githubusercontent.com/pterodactyl-installer/pterodactyl-installer/master"

      export GITHUB_SOURCE="master"
      export SCRIPT_RELEASE="canary"
      export GITHUB_BASE_URL="$INSTALLER_BASE"
      export FQDN="$PANEL_FQDN"
      export MYSQL_DB="panel"
      export MYSQL_USER="pterodactyl"
      export MYSQL_PASSWORD="$DB_PASSWORD"
      export timezone="$TIMEZONE"
      export email="$ADMIN_EMAIL"
      export user_email="$ADMIN_EMAIL"
      export user_username="$ADMIN_USERNAME"
      export user_firstname="$ADMIN_FIRSTNAME"
      export user_lastname="$ADMIN_LASTNAME"
      export user_password="$ADMIN_PASSWORD"
      export ASSUME_SSL="false"
      export CONFIGURE_LETSENCRYPT="false"
      export CONFIGURE_UFW="true"
      export CONFIGURE_FIREWALL_CMD="false"
      export CONFIGURE_FIREWALL="true"

      bash <(curl -sSL "$INSTALLER_BASE/lib/lib.sh")
      bash <(curl -sSL "$INSTALLER_BASE/installers/panel.sh") \
        || fail "Panel installer exited with error"

      log "Panel installer complete."

      # ── Step 2: Generate Application API Key ──────────────────────────────
      log "[2/6] Generating application API key..."

      # Retry loop — panel may need a moment to be fully ready
      API_KEY=""
      for i in $(seq 1 10); do
        API_KEY=$(cd /var/www/pterodactyl && php artisan p:user:make \
          --email="$ADMIN_EMAIL" \
          --username="$ADMIN_USERNAME" \
          --name-first="$ADMIN_FIRSTNAME" \
          --name-last="$ADMIN_LASTNAME" \
          --password="$ADMIN_PASSWORD" \
          --admin=1 \
          --no-interaction 2>/dev/null | true)
        # Create the API key
        API_KEY=$(cd /var/www/pterodactyl && php artisan p:api:create \
          --memo="autodeploy-$$" \
          --no-interaction 2>/dev/null | grep -oP '[a-zA-Z0-9]{48}' | head -1)
        [ -n "$API_KEY" ] && break
        log "  Waiting for panel to be ready (attempt $i)..."
        sleep 6
      done

      [ -n "$API_KEY" ] || fail "Could not generate API key after 10 attempts"
      log "API key generated."

      PANEL_API="http://localhost/api/application"
      AUTH_HDR="Authorization: Bearer $API_KEY"

      # ── Step 3: Create Location + Node via API ────────────────────────────
      log "[3/6] Creating location and node via Panel API..."

      LOCATION_RESP=$(curl -sf -X POST "$PANEL_API/locations" \
        -H "$AUTH_HDR" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "{\"short\":\"$LOCATION_NAME\",\"long\":\"Auto-deployed\"}" \
        || fail "Location create API call failed")

      LOCATION_ID=$(echo "$LOCATION_RESP" \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['attributes']['id'])")

      log "Location ID: $LOCATION_ID"

      NODE_RESP=$(curl -sf -X POST "$PANEL_API/nodes" \
        -H "$AUTH_HDR" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "{
          \"name\": \"$NODE_NAME\",
          \"location_id\": $LOCATION_ID,
          \"fqdn\": \"$WINGS_FQDN\",
          \"scheme\": \"https\",
          \"memory\": $NODE_MEMORY,
          \"memory_overallocate\": 0,
          \"disk\": $NODE_DISK,
          \"disk_overallocate\": 0,
          \"upload_size\": 100,
          \"daemon_sftp\": 2022,
          \"daemon_listen\": 8080,
          \"public\": true
        }" || fail "Node create API call failed")

      NODE_ID=$(echo "$NODE_RESP" \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['attributes']['id'])")

      log "Node ID: $NODE_ID"

      # ── Step 4: Pull Wings config.yml ────────────────────────────────────
      log "[4/6] Fetching Wings config from Panel API..."

      mkdir -p /etc/pterodactyl

      # The Panel API returns the Wings config as JSON — convert to YAML
      curl -sf "$PANEL_API/nodes/$NODE_ID/configuration" \
        -H "$AUTH_HDR" \
        -H "Accept: application/json" \
        | python3 -c "
      import sys, json
      try:
          import yaml
          data = json.load(sys.stdin)
          print(yaml.dump(data, default_flow_style=False))
      except ImportError:
          # Fallback: write raw JSON, Wings accepts it
          data = json.load(sys.stdin)
          import json as j
          print(j.dumps(data, indent=2))
      " > /etc/pterodactyl/config.yml \
        || fail "Could not fetch Wings config.yml from Panel API"

      log "config.yml written to /etc/pterodactyl/"

      # ── Step 5: Install Wings ─────────────────────────────────────────────
      log "[5/6] Installing Wings..."

      export FQDN="$WINGS_FQDN"
      export CONFIGURE_LETSENCRYPT="false"
      export EMAIL="$ADMIN_EMAIL"
      export INSTALL_MARIADB="false"
      export CONFIGURE_DBHOST="false"
      export CONFIGURE_FIREWALL="true"
      export CONFIGURE_DB_FIREWALL="false"

      bash <(curl -sSL "$INSTALLER_BASE/installers/wings.sh") \
        || fail "Wings installer exited with error"

      log "Wings installer complete."

      # ── Step 6: Start Wings ───────────────────────────────────────────────
      log "[6/6] Starting Wings..."

      systemctl enable --now wings
      sleep 15

      # Poll Wings connection status via Panel API
      NODE_STATUS="pending"
      for i in $(seq 1 12); do
        NODE_STATUS=$(curl -sf "$PANEL_API/nodes/$NODE_ID" \
          -H "$AUTH_HDR" -H "Accept: application/json" \
          | python3 -c "
      import sys, json
      d = json.load(sys.stdin)['attributes']
      print('online' if d.get('daemon_online', False) else 'pending')
          " 2>/dev/null || echo "pending")
        [ "$NODE_STATUS" = "online" ] && break
        log "  Waiting for Wings to register (attempt $i)..."
        sleep 10
      done

      log "Node status: $NODE_STATUS"

      # ── Save credentials ──────────────────────────────────────────────────
      cat > /root/.ptero_credentials <<CREDS
      Panel URL:      https://$PANEL_FQDN
      Admin Email:    $ADMIN_EMAIL
      Admin Username: $ADMIN_USERNAME
      Admin Password: $ADMIN_PASSWORD
      DB Password:    $DB_PASSWORD
      Node ID:        $NODE_ID
      Node Status:    $NODE_STATUS

      ACTION REQUIRED — Add these in Cloudflare Dashboard:
      Tunnel → Public Hostnames:
        panel.$PANEL_FQDN → http://localhost:80
        $WINGS_FQDN       → http://localhost:8080   (Wings API)
        $WINGS_FQDN:2022  → tcp://localhost:2022    (Wings SFTP)
      CREDS
      chmod 600 /root/.ptero_credentials

      # ── POST to webhook ───────────────────────────────────────────────────
      curl -sf -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "$(python3 -c "
      import json
      print(json.dumps({
        'deploy_id':      '$DEPLOY_ID',
        'deploy_secret':  '$DEPLOY_SECRET',
        'panel_url':      'https://$PANEL_FQDN',
        'admin_email':    '$ADMIN_EMAIL',
        'admin_password': '$ADMIN_PASSWORD',
        'node_id':        $NODE_ID,
        'node_status':    '$NODE_STATUS'
      }))
      ")" || log "WARNING: Webhook POST failed — credentials are in /root/.ptero_credentials"

      log "Install complete."

runcmd:
  - bash /root/ptero-install.sh >> /var/log/ptero-install.log 2>&1
```

---

## 8. Layer 4 — Cloudflare Tunnel Setup

```
CLIENT VM (no public IPv4)
        │
        │  cloudflared tunnel (outbound only)
        │  establishes persistent conn to CF edge
        ▼
CLOUDFLARE EDGE
        │
        │  Routes inbound requests by hostname
        ├──  panel.domain.com  → VM:80   (Pterodactyl Panel)
        ├──  wings.domain.com  → VM:8080 (Wings API)
        └──  wings.domain.com  → VM:2022 (Wings SFTP)
        ▲
        │
CLIENT BROWSER or WINGS DAEMON
```

### Why `USE_SSL=false` is correct here

The bird installer's `CONFIGURE_LETSENCRYPT=true` flag makes certbot run an HTTP-01 or
TLS-ALPN challenge against `$FQDN`. Inside a CF tunnel that challenge will either fail
(CF intercepts it) or produce a cert that conflicts with CF's own TLS termination.
The panel should listen on plain HTTP locally — CF terminates HTTPS externally with
its own cert (which is automatically trusted). Setting `ASSUME_SSL=false` tells Nginx
not to try loading a cert that doesn't exist.

### CF DNS record the client must add (post-install)

```
Type  Name            Content              Proxy
CNAME panel           <tunnel-id>.cfargotunnel.com   ✅ (proxied)
CNAME wings           <tunnel-id>.cfargotunnel.com   ✅ (proxied)
```

The tunnel ID is embedded in the token — it does not need to be looked up separately.

---

## 9. Layer 5 — Pterodactyl Install & API Wiring

### Why call `installers/panel.sh` directly instead of `install.sh`

`install.sh` launches `ui/panel.sh` which is interactive. It reads from stdin with `read`
calls that will hang forever in a cloud-init context. The `installers/panel.sh` script
is the non-interactive core — it reads from env vars only. Same applies to Wings.

### API Key generation via artisan

There is no stable public CLI command for this across all pterodactyl versions. The
safest approach is:

```bash
# Create via artisan directly — outputs the key on the last line
API_KEY=$(cd /var/www/pterodactyl && \
  php artisan p:api:create --memo="auto" --no-interaction 2>/dev/null \
  | grep -oP '[a-zA-Z0-9]{48}' | head -1)
```

If the artisan command changes between Pterodactyl versions, fall back to querying
the DB directly:

```bash
# Fallback — create key row directly in MariaDB
php artisan tinker --no-interaction <<'PHP'
use App\Models\User;
use App\Models\ApiKey;
$user = User::where('root_admin', true)->first();
$key = ApiKey::create([
  'user_id'     => $user->id,
  'key_type'    => ApiKey::TYPE_APPLICATION,
  'identifier'  => str_random(16),
  'token'       => encrypt(str_random(32)),
  'memo'        => 'auto',
  'allowed_ips' => null,
  'r_servers'   => ApiKey::WRITE,
  // ... other permissions
]);
echo $key->identifier;
PHP
```

### Wings config.yml — what the API returns

The Panel API endpoint `GET /api/application/nodes/:id/configuration` returns a JSON
object that Wings accepts directly. The structure looks like:

```json
{
  "debug": false,
  "uuid": "<node-uuid>",
  "token_id": "<token-id>",
  "token": "<wings-token>",
  "api": {
    "host": "0.0.0.0",
    "port": 8080,
    "ssl": { "enabled": false, "cert": "", "key": "" },
    "upload_limit": 100
  },
  "system": {
    "data": "/var/lib/pterodactyl/volumes",
    "sftp": { "bind_port": 2022 }
  },
  "allowed_mounts": [],
  "remote": "https://<panel-fqdn>"
}
```

This is written verbatim to `/etc/pterodactyl/config.yml`. Wings will start and
immediately reach back to the panel using the token — no further manual config required.

---

## 10. Layer 6 — Credential Delivery

```typescript
// backend/services/mailer.ts

export async function sendCredentialEmail(payload: {
  to: string;
  panel_url: string;
  admin_email: string;
  admin_password: string;
  node_id: number;
  note?: string;
}) {
  await mailer.sendMail({
    from: process.env.MAIL_FROM,
    to: payload.to,
    subject: "Your Pterodactyl panel is ready",
    text: `
Your Pterodactyl Panel is ready!

Panel URL:      ${payload.panel_url}
Login Email:    ${payload.admin_email}
Login Password: ${payload.admin_password}

Node ${payload.node_id} has been automatically configured and Wings is running.
${payload.note ?? ""}

IMPORTANT — Cloudflare DNS:
Before you can access your panel, add the following in your Cloudflare dashboard:

  Dashboard → <your domain> → DNS
  Add CNAME:  panel  →  <your-tunnel-id>.cfargotunnel.com  (Proxied ✅)

Then go to Zero Trust → Tunnels → your tunnel → Public Hostnames:
  panel.<yourdomain>  →  http://localhost:80
  wings.<yourdomain>  →  http://localhost:8080

Once that's done, your panel will be live at ${payload.panel_url}
    `.trim(),
  });
}
```

---

## 11. Database Schema

```sql
-- db/schema.sql

CREATE TABLE deploys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  convoy_server_id TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
    -- pending | provisioning | running | complete | failed
  secret        TEXT NOT NULL,             -- used to auth the VM webhook
  config        JSONB,                     -- encrypted resolved config (with passwords)
  credentials   JSONB,                     -- populated on webhook complete
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE servers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  deploy_id     UUID REFERENCES deploys(id),
  convoy_id     TEXT,
  panel_url     TEXT,
  node_id       INTEGER,
  type          TEXT DEFAULT 'pterodactyl',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Index for fast polling lookups
CREATE INDEX idx_deploys_user_id ON deploys(user_id);
CREATE INDEX idx_deploys_status  ON deploys(status);
```

---

## 12. Critical Flaws & How to Avoid Them

### Flaw 1 — `set -e` kills the script on any non-zero exit

The cloud-init script uses `set -euo pipefail` which is good for catching errors but
will silently exit mid-install if any command fails — including benign things like
`grep` finding no match.

**Fix**: Wrap every call that might legitimately return non-zero:

```bash
# BAD — if grep finds nothing, script dies
API_KEY=$(php artisan p:api:create | grep -oP '[a-zA-Z0-9]{48}')

# GOOD — || true prevents grep exit code from killing the script
API_KEY=$(php artisan p:api:create | grep -oP '[a-zA-Z0-9]{48}' || true)
[ -n "$API_KEY" ] || fail "No API key found"
```

---

### Flaw 2 — Race condition between Panel install and API calls

The panel installer finishes when `artisan migrate --seed` completes, but Nginx and PHP-FPM
may not yet be serving requests. An immediate `curl` to the API will get a 502.

**Fix**: Use a retry loop with backoff, not a bare `sleep`:

```bash
wait_for_panel() {
  for i in $(seq 1 20); do
    STATUS=$(curl -so /dev/null -w "%{http_code}" "http://localhost/api/application/nodes" \
      -H "$AUTH_HDR" -H "Accept: application/json" 2>/dev/null || echo "000")
    [ "$STATUS" = "200" ] && return 0
    log "  Panel not ready yet (HTTP $STATUS, attempt $i)..."
    sleep 8
  done
  fail "Panel API never became available"
}
wait_for_panel
```

---

### Flaw 3 — CF tunnel token injected as a shell variable contains special chars

CF tunnel tokens are base64-encoded JWTs. They can contain `+`, `/`, and `=` which
break naive shell variable assignment if not quoted correctly.

**Fix**: Always double-quote the variable on assignment and use. The template writes it as:

```bash
CF_TUNNEL_TOKEN="##CF_TUNNEL_TOKEN##"
```

And the backend must escape double-quotes in the value before injection:

```typescript
const safe = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
```

---

### Flaw 4 — `python3-yaml` may not be installed when config.yml conversion runs

The cloud-init `packages:` block installs `python3-yaml` but this runs asynchronously
with `runcmd`. There is no guarantee packages are installed before runcmd executes.

**Fix**: Use `apt-get install -y python3-yaml` inside the script itself at the top,
before the conversion is needed. Do not rely on cloud-init package phase ordering.

```bash
# At the top of ptero-install.sh, before any python3 yaml usage
apt-get install -y python3-yaml --no-install-recommends -q
```

---

### Flaw 5 — Wings `scheme: https` in node config but panel is HTTP locally

When the node is created via API with `"scheme": "https"`, Wings will try to connect
back to the panel over HTTPS. Since the panel only listens on HTTP locally (CF handles
HTTPS externally), this will fail unless you're routing Wings → CF → Panel.

**Fix**: Set scheme based on whether Wings is on the same VM or a separate node:

```bash
# Same VM: Wings talks to panel on localhost over HTTP
SCHEME="http"

# Separate VM: Wings must go through CF tunnel, use https
# SCHEME="https"
```

For the single-VM case (panel + wings same machine), create the node with `"scheme": "http"`
and point `"remote"` to `http://localhost`. For multi-node setups the client would need
separate VMs — handle that as a separate template.

---

### Flaw 6 — Unreplaced `##VAR##` placeholders reaching the VM

If any variable is missing from the injection map, the literal `##VAR##` string ends
up in the shell script. Depending on position this either causes a syntax error
(if inside quotes) or silently uses wrong values.

**Fix**: The template engine already checks for leftover placeholders — but also validate
on the frontend before the user can submit:

```typescript
// After building cloud-init on backend (pre-Convoy call), scan it
const unreplaced = cloudInit.match(/##[A-Z_]+##/g);
if (unreplaced) throw new Error(`Unreplaced: ${unreplaced.join(", ")}`);
```

---

### Flaw 7 — Passwords containing special chars break JSON in the webhook POST

The final webhook POST builds JSON via string interpolation in bash. If `$ADMIN_PASSWORD`
contains `"` or `\` the JSON is malformed and the webhook silently fails.

**Fix**: Always use python3 to build the JSON — never concatenate passwords into JSON manually:

```bash
# BAD
-d "{\"admin_password\": \"$ADMIN_PASSWORD\"}"

# GOOD — python3 handles all escaping
-d "$(python3 -c "import json; print(json.dumps({'admin_password': '$ADMIN_PASSWORD'}))")"

# EVEN BETTER — use a heredoc so the var never touches the JSON string
python3 <<PYEOF
import json, os
print(json.dumps({
  'admin_password': os.environ.get('ADMIN_PASSWORD', ''),
}))
PYEOF
```

When generating passwords in your backend, restrict charset to `[a-zA-Z0-9]` only.
This eliminates the entire class of shell/JSON injection from passwords.

```typescript
export function generatePassword(length = 32): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(b => chars[b % chars.length])
    .join("");
}
```

---

### Flaw 8 — Cloud-init `write_files` content indentation corrupts the script

YAML is whitespace-sensitive. If the bash script content inside `write_files` gets
extra indentation added (by an editor, linter, or template engine), the heredocs and
multi-line strings inside it will break.

**Fix**: Keep the template YAML unformatted by editors. Add a `.editorconfig` rule
and a pre-commit check that the file hasn't been auto-reformatted.

---

### Flaw 9 — The deploy webhook has no replay protection

If the VM retries the webhook POST (network blip, timeout), the backend receives it
twice. If the email send is not idempotent this means two credential emails.

**Fix**: Use the `deploy_id` as an idempotency key — check if credentials are already
saved before processing:

```typescript
const existing = await db.getDeploy(deploy_id);
if (existing.status === "complete") {
  return res.json({ ok: true, note: "already processed" });
}
```

---

### Flaw 10 — Panel installer version drift

The bird installer pulls the latest Pterodactyl panel. If a breaking version ships
between when you built your system and when a client deploys, the install silently
fails or produces a broken panel.

**Fix**: Pin `GITHUB_SOURCE` to a specific tag in the installer env vars:

```bash
export GITHUB_SOURCE="v1.3.0"   # pin to last tested version
```

Update and test before bumping the pin. Never use `master` in production.

---

## 13. Execution Checklist

Work through this in order before going live.

```
PRE-BUILD
  ☐ Proxmox base template is Ubuntu 22.04 or 24.04 (cloud image, cloud-init enabled)
  ☐ Convoy API key created and scoped to server create/delete only
  ☐ WEBHOOK_BASE_URL is publicly reachable (not localhost)
  ☐ DEPLOY_SECRET rotation strategy decided (per-deploy is correct, never global)
  ☐ Password generator uses alphanum-only charset

BACKEND
  ☐ Template engine throws on unreplaced ##VAR## before Convoy call
  ☐ All passwords generated server-side, never trusted from client
  ☐ Deploy record written to DB before Convoy call (not after)
  ☐ Webhook receiver checks deploy secret
  ☐ Webhook receiver is idempotent (duplicate POSTs are no-ops)
  ☐ Credentials stored encrypted in DB (not plaintext JSONB)

CLOUD-INIT SCRIPT
  ☐ set -euo pipefail at top
  ☐ fail() function POSTs error to webhook before exiting
  ☐ CF tunnel verified active before panel install begins
  ☐ Panel API wait loop with retry (not bare sleep)
  ☐ API key generation has retry loop
  ☐ Node created with correct scheme (http for same-VM, https for remote)
  ☐ python3-yaml installed inside script before first yaml conversion
  ☐ All JSON built with python3, not bash string concat
  ☐ Credentials file chmod 600

CLOUDFLARE
  ☐ USE_SSL=false forced by backend regardless of client toggle
  ☐ ASSUME_SSL=false forced
  ☐ CONFIGURE_LETSENCRYPT=false forced
  ☐ Client instructions clearly state they must add CF DNS + tunnel hostname

TESTING
  ☐ Deploy a test VM end-to-end before exposing to clients
  ☐ Verify webhook fires and email is received
  ☐ Verify Wings shows as online in Panel after deploy
  ☐ Simulate fail() path — confirm error reaches webhook
  ☐ Test with a password containing no special chars (alphanum generator)
  ☐ Check /var/log/ptero-install.log on test VM for any silent failures
```

---

*Last updated: August 2026*
