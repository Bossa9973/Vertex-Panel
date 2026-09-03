"""
panel_api.py — Discord Bot ↔ Laravel Panel API bridge
======================================================
Replaces firebase_db.py entirely. All data now lives in MySQL via the panel.

All functions are async and use httpx under the hood.
The bot sends:  Authorization: Bot <BOT_API_SECRET>
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

PANEL_URL     = os.getenv("PANEL_URL", "http://localhost:8000").rstrip("/")
BOT_SECRET    = os.getenv("BOT_API_SECRET", "")
BASE_URL      = f"{PANEL_URL}/api/bot"

def _headers() -> dict:
    return {
        "Authorization": f"Bot {BOT_SECRET}",
        "Accept":        "application/json",
        "Content-Type":  "application/json",
    }

_client: httpx.AsyncClient | None = None

def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=15.0, verify=False)
    return _client

async def _post(path: str, payload: dict, timeout: float = 15.0) -> dict:
    """POST to the panel bot API. Returns the JSON response or raises on error."""
    client = _get_client()
    try:
        r = await client.post(f"{BASE_URL}{path}", json=payload, headers=_headers(), timeout=timeout)
    except httpx.TimeoutException:
        raise Exception(f"Connection to {BASE_URL}{path} timed out after {timeout}s (check PANEL_URL in bot/.env)")
    except httpx.ConnectError as ce:
        raise Exception(f"Cannot connect to panel at {BASE_URL} ({ce or 'Connection refused'})")
    except Exception as ex:
        raise Exception(f"POST to {path} failed: {type(ex).__name__}: {ex or repr(ex)}")

    if r.status_code >= 400:
        err_msg = f"HTTP {r.status_code}"
        try:
            body = r.json()
            err_msg = body.get("error") or body.get("message") or f"HTTP {r.status_code}: {r.text[:200]}"
        except Exception:
            err_msg = f"HTTP {r.status_code}: {r.text[:200]}"
        raise Exception(err_msg)
    return r.json()

async def _get(path: str, timeout: float = 15.0) -> dict:
    """GET from the panel bot API. Returns the JSON response or raises on error."""
    client = _get_client()
    try:
        r = await client.get(f"{BASE_URL}{path}", headers=_headers(), timeout=timeout)
    except httpx.TimeoutException:
        raise Exception(f"Connection to {BASE_URL}{path} timed out after {timeout}s (check PANEL_URL in bot/.env)")
    except httpx.ConnectError as ce:
        raise Exception(f"Cannot connect to panel at {BASE_URL} ({ce or 'Connection refused'})")
    except Exception as ex:
        raise Exception(f"GET from {path} failed: {type(ex).__name__}: {ex or repr(ex)}")

    if r.status_code >= 400:
        err_msg = f"HTTP {r.status_code}"
        try:
            body = r.json()
            err_msg = body.get("error") or body.get("message") or f"HTTP {r.status_code}: {r.text[:200]}"
        except Exception:
            err_msg = f"HTTP {r.status_code}: {r.text[:200]}"
        raise Exception(err_msg)
    return r.json()

# ─── Stats tracking ───────────────────────────────────────────────────────────

async def add_message(discord_id: str) -> None:
    """Increment the message counter for a Discord user."""
    try:
        await _post("/stats/message", {"discord_id": discord_id}, timeout=3.0)
    except Exception as e:
        print(f"[panel_api] add_message failed for {discord_id}: {e}")

async def add_boost(discord_id: str) -> None:
    """Increment the boost counter for a Discord user."""
    try:
        await _post("/stats/boost", {"discord_id": discord_id})
    except Exception as e:
        print(f"[panel_api] add_boost failed for {discord_id}: {e}")

async def get_stats(discord_id: str) -> dict:
    """Fetch aggregated stats for a Discord user."""
    try:
        return await _get(f"/stats/{discord_id}")
    except Exception as e:
        print(f"[panel_api] get_stats failed for {discord_id}: {e}")
        return {"messages": 0, "boosts": 0, "joined": 0, "left": 0, "fake": 0, "valid": 0}

# ─── Invite tracking ──────────────────────────────────────────────────────────

async def track_invite_create(code: str, inviter_id: str) -> None:
    """Store a new invite code and its creator."""
    try:
        await _post("/invite/track", {"code": code, "inviter_discord_id": inviter_id})
    except Exception as e:
        print(f"[panel_api] track_invite_create failed: {e}")

async def track_invites_bulk(invites: list[dict]) -> None:
    """Bulk store multiple invite codes and their creators in one HTTP request."""
    if not invites:
        return
    try:
        await _post("/invite/track-bulk", {"invites": invites}, timeout=10.0)
    except Exception as e:
        print(f"[panel_api] track_invites_bulk failed: {e}")

async def add_invited_user(discord_id: str, inviter_id: str, is_fake: bool) -> None:
    """Record that discord_id joined via inviter_id's invite link."""
    try:
        await _post("/invite/join", {
            "discord_id":         discord_id,
            "inviter_discord_id": inviter_id,
            "is_fake":            is_fake,
        })
    except Exception as e:
        print(f"[panel_api] add_invited_user failed: {e}")

async def update_invited_user_status(discord_id: str, status: str) -> None:
    """Mark a user as having left (status='left')."""
    try:
        await _post("/invite/leave", {"discord_id": discord_id})
    except Exception as e:
        print(f"[panel_api] update_invited_user_status failed: {e}")

# ─── Admin operations ─────────────────────────────────────────────────────────

async def admin_add_messages(discord_id: str, amount: int) -> None:
    await _post("/admin/add-messages", {"discord_id": discord_id, "amount": amount})

async def admin_add_invites(discord_id: str, amount: int) -> None:
    await _post("/admin/add-invites", {"discord_id": discord_id, "amount": amount})

async def admin_reset_user(discord_id: str) -> None:
    await _post("/admin/reset-user", {"discord_id": discord_id})

async def admin_reset_all() -> None:
    await _post("/admin/reset-all", {})

async def generate_promo_code(discord_id: str, amount: int, admin_discord_id: str, reason: str = "Admin Gift") -> str:
    """
    Ask the panel to create a promo code for discord_id with reason and admin logging.
    Returns the generated code string, e.g. 'LMN-AB12-CD34'.
    """
    data = await _post("/admin/generate-code", {
        "discord_id":       discord_id,
        "amount":           amount,
        "admin_discord_id": admin_discord_id,
        "reason":           reason,
    })
    return data["code"]

# ─── Balance Operations ──────────────────────────────────────────────────────

async def admin_add_balance(discord_id: str, amount: float, admin_discord_id: str, reason: str = "Admin Credit Grant") -> dict:
    """Add balance (BOLTs) to a user's account."""
    try:
        return await _post("/admin/balance/add", {
            "discord_id":       str(discord_id).strip(),
            "amount":           amount,
            "admin_discord_id": str(admin_discord_id).strip(),
            "reason":           reason,
        })
    except Exception as e:
        return {"ok": False, "error": str(e)}

async def admin_deduct_balance(discord_id: str, amount: float, admin_discord_id: str, reason: str = "Admin Credit Deduction") -> dict:
    """Deduct balance (BOLTs) from a user's account."""
    try:
        return await _post("/admin/balance/deduct", {
            "discord_id":       str(discord_id).strip(),
            "amount":           amount,
            "admin_discord_id": str(admin_discord_id).strip(),
            "reason":           reason,
        })
    except Exception as e:
        return {"ok": False, "error": str(e)}

async def admin_set_balance(discord_id: str, amount: float, admin_discord_id: str, reason: str = "Staff Hard Balance Override") -> dict:
    """Hard set a user's balance to an exact amount."""
    try:
        return await _post("/admin/balance/set", {
            "discord_id":       str(discord_id).strip(),
            "amount":           amount,
            "admin_discord_id": str(admin_discord_id).strip(),
            "reason":           reason,
        })
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ─── Promo Code Revocation & User Promos ─────────────────────────────────────

async def get_user_promos(discord_id: str) -> dict:
    """Fetch all promo codes issued to a Discord user."""
    try:
        return await _get(f"/admin/user-promos/{str(discord_id).strip()}")
    except Exception as e:
        return {"ok": False, "error": str(e), "promos": []}

async def revoke_promo_code(code: str, admin_discord_id: str, reason: str = "Revoked by Administrator") -> dict:
    """Revoke an active promo code."""
    try:
        return await _post("/admin/promo/revoke", {
            "code":             str(code).strip().upper(),
            "admin_discord_id": str(admin_discord_id).strip(),
            "reason":           reason,
        })
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ─── User History & Tracking ──────────────────────────────────────────────────

async def get_user_history(identifier: str) -> dict:
    """
    Fetch comprehensive user history including balance, spending, promo codes,
    owned servers, lifecycle events, and Discord stats.
    """
    try:
        return await _post("/user-history", {"identifier": identifier})
    except Exception as e:
        print(f"[panel_api] get_user_history failed for {identifier}: {e}")
        return {"ok": False, "error": str(e)}

# ─── Promo code redemption ────────────────────────────────────────────────────

async def redeem_code(code: str, discord_id: str) -> dict:
    """
    Redeem a promo code for the given Discord user.
    Returns: { ok, amount, new_balance, message } on success
             { ok=False, error } on failure
    """
    try:
        return await _post("/promo/redeem", {"code": code, "discord_id": discord_id})
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ─── Transaction Lookup ───────────────────────────────────────────────────────

async def get_transaction_details(identifier: str) -> dict:
    """
    Look up detailed metadata for a transaction ID or reference (e.g. RENEW-5OBDSIRG, DEPLOY-XXX).
    Returns detailed info on server name, price when bought, expiry date, creation date, specs, user, etc.
    """
    try:
        return await _post("/transaction", {"reference_id": identifier.strip()})
    except Exception as e:
        print(f"[panel_api] get_transaction_details failed for {identifier}: {e}")
        return {"ok": False, "error": str(e)}

# ─── VM Deletion ─────────────────────────────────────────────────────────────

async def delete_vm(server_id: str, admin_discord_id: str, user_discord_id: str, force: bool = False) -> dict:
    """
    Request the panel to delete a VM instance for a user.
    If standard hypervisor uninstall fails, the panel automatically falls back to database wipe.
    """
    try:
        return await _post("/admin/delete-vm", {
            "server_id": str(server_id).strip(),
            "admin_discord_id": str(admin_discord_id).strip(),
            "user_discord_id": str(user_discord_id).strip(),
            "force": force,
        })
    except Exception as e:
        print(f"[panel_api] delete_vm failed for server {server_id}: {e}")
        return {"ok": False, "error": str(e)}

# ─── Pterodactyl Deploy DM Queue ──────────────────────────────────────────────

async def poll_pterodactyl_dm_queue() -> list:
    """
    Fetch pending Pterodactyl deploy completion DMs from the panel.
    The panel queues them in pterodactyl_dm_queue when a VM finishes installing.
    Returns a list of pending DM payloads (or empty list if none / error).
    """
    try:
        result = await _get("/ptero-dm-queue")
        return result.get("pending", [])
    except Exception as e:
        print(f"[panel_api] poll_pterodactyl_dm_queue failed: {e}")
        return []

async def mark_pterodactyl_dm_sent(queue_id: int) -> None:
    """Mark a queued Pterodactyl DM as sent so it isn't re-delivered."""
    try:
        await _post("/ptero-dm-queue/mark-sent", {"id": queue_id})
    except Exception as e:
        print(f"[panel_api] mark_pterodactyl_dm_sent failed for id {queue_id}: {e}")

# ─── Server Actions & Controls ────────────────────────────────────────────────

async def get_server_state(discord_id: str, server_id: int) -> dict:
    """Fetch current state of a server owned by a user."""
    try:
        return await _get(f"/server-state/{discord_id}/{server_id}")
    except Exception as e:
        return {"ok": False, "error": str(e)}

async def perform_server_action(discord_id: str, server_id: int, action: str) -> dict:
    """Send a power action (start/stop/restart/kill) to a server."""
    try:
        return await _post("/server-action", {
            "discord_id": str(discord_id).strip(),
            "server_id": int(server_id),
            "action": action.strip().lower(),
        })
    except Exception as e:
        return {"ok": False, "error": str(e)}

async def rename_server(discord_id: str, server_id: int, name: str) -> dict:
    """Rename a server owned by a user."""
    try:
        return await _post("/server-rename", {
            "discord_id": str(discord_id).strip(),
            "server_id": int(server_id),
            "name": name.strip(),
        })
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ════════════════════════════════════════════════════════════════
# Backup Operations
# ════════════════════════════════════════════════════════════════

async def get_nodes() -> list:
    """Fetch all Proxmox nodes from the panel bot API."""
    try:
        data = await _get("/nodes")
        return data.get("data", [])
    except Exception as e:
        print(f"[panel_api] get_nodes failed: {e}")
        return []

async def trigger_backups(
    *,
    server_ids: list[int] | None = None,
    node_id: int | None = None,
    tier: str = "all",
    force: bool = True,
) -> dict:
    """
    Trigger VM backups and upload to Google Drive.

    Args:
        server_ids: Specific server IDs to back up (overrides node/tier).
        node_id:    Only back up servers on this node.
        tier:       'all' | 'paid' | 'free'
        force:      Bypass 24-hour backup window (default True for manual triggers).

    Returns:
        { ok, dispatched, skipped, message } or { ok: False, error }
    """
    try:
        payload: dict = {"force": force}
        if server_ids:
            payload["server_ids"] = server_ids
        else:
            payload["all"] = True
            if node_id:
                payload["node_id"] = node_id
            if tier and tier != "all":
                payload["tier"] = tier

        return await _post("/backup/trigger", payload, timeout=60.0)
    except Exception as e:
        print(f"[panel_api] trigger_backups failed: {e}")
        return {"ok": False, "error": str(e)}

async def set_server_tier(server_id: int | str, tier: str) -> dict:
    """Set the plan tier (free or paid) for a specific server."""
    try:
        return await _post("/backup/set-tier", {
            "server_id": int(server_id),
            "tier": tier,
        })
    except Exception as e:
        print(f"[panel_api] set_server_tier failed for #{server_id}: {e}")
        return {"ok": False, "error": str(e)}


# =========================================================================
# Abuse Operations
# =========================================================================

async def get_abuse_list() -> dict:
    """Fetch all users detected for reward claim or promo abuse."""
    try:
        return await _get("/admin/abuse-list", timeout=30.0)
    except Exception as e:
        print(f"[panel_api] get_abuse_list failed: {e}")
        return {"ok": False, "error": str(e), "abusers": []}


async def remediate_abuse(
    admin_discord_id: str,
    user_id: int | None = None,
    discord_id: str | None = None,
    wipe_servers: bool = True,
    suspend_days: int = 0,
    reasons: list[str] | None = None,
) -> dict:
    """Remediate abusive user: wipe all VPS servers (Proxmox + DB) and reset balance to legitimate reward."""
    try:
        payload: dict = {
            "admin_discord_id": str(admin_discord_id),
            "wipe_servers": wipe_servers,
            "suspend_days": suspend_days,
        }
        if user_id is not None:
            payload["user_id"] = user_id
        if discord_id is not None:
            payload["discord_id"] = str(discord_id)
        if reasons is not None:
            payload["reasons"] = reasons

        return await _post("/admin/abuse-remediate", payload, timeout=60.0)
    except Exception as e:
        print(f"[panel_api] remediate_abuse failed for user {user_id or discord_id}: {e}")
        return {"ok": False, "error": str(e)}


async def get_abusers(discord_id: str | None = None, user_id: int | None = None) -> dict:
    """Fetch saved abusers list and history (for AI support bot and dashboard)."""
    try:
        params = []
        if discord_id:
            params.append(f"discord_id={discord_id}")
        if user_id:
            params.append(f"user_id={user_id}")
        query = f"?{'&'.join(params)}" if params else ""
        return await _get(f"/admin/abusers{query}", timeout=20.0)
    except Exception as e:
        print(f"[panel_api] get_abusers failed: {e}")
        return {"ok": False, "error": str(e), "abusers": []}


async def suspend_user(
    admin_discord_id: str,
    discord_id: str | None = None,
    user_id: int | None = None,
    days: int = 14,
    reason: str = "",
) -> dict:
    """Suspend a user from earning rewards and deploying VPS servers."""
    try:
        payload = {
            "admin_discord_id": str(admin_discord_id),
            "days": days,
            "reason": reason,
        }
        if discord_id is not None:
            payload["discord_id"] = str(discord_id)
        if user_id is not None:
            payload["user_id"] = user_id

        return await _post("/admin/user-suspend", payload, timeout=20.0)
    except Exception as e:
        print(f"[panel_api] suspend_user failed: {e}")
        return {"ok": False, "error": str(e)}


async def unsuspend_user(
    admin_discord_id: str,
    discord_id: str | None = None,
    user_id: int | None = None,
) -> dict:
    """Unsuspend a user account."""
    try:
        payload = {
            "admin_discord_id": str(admin_discord_id),
        }
        if discord_id is not None:
            payload["discord_id"] = str(discord_id)
        if user_id is not None:
            payload["user_id"] = user_id

        return await _post("/admin/user-unsuspend", payload, timeout=20.0)
    except Exception as e:
        print(f"[panel_api] unsuspend_user failed: {e}")
        return {"ok": False, "error": str(e)}


