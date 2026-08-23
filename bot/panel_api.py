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

async def _post(path: str, payload: dict) -> dict:
    """POST to the panel bot API. Returns the JSON response or raises on error."""
    async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
        r = await client.post(f"{BASE_URL}{path}", json=payload, headers=_headers())
        if r.status_code >= 400:
            try:
                body = r.json()
                err_msg = body.get("error") or body.get("message") or f"HTTP {r.status_code}"
                raise Exception(err_msg)
            except Exception as e:
                if not str(e).startswith("HTTP ") and "error" not in str(e).lower():
                    raise e
                raise Exception(f"HTTP {r.status_code}: {r.text}")
        return r.json()

async def _get(path: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
        r = await client.get(f"{BASE_URL}{path}", headers=_headers())
        if r.status_code >= 400:
            try:
                body = r.json()
                err_msg = body.get("error") or body.get("message") or f"HTTP {r.status_code}"
                raise Exception(err_msg)
            except Exception as e:
                if not str(e).startswith("HTTP ") and "error" not in str(e).lower():
                    raise e
                raise Exception(f"HTTP {r.status_code}: {r.text}")
        return r.json()

# ─── Stats tracking ───────────────────────────────────────────────────────────

async def add_message(discord_id: str) -> None:
    """Increment the message counter for a Discord user."""
    try:
        await _post("/stats/message", {"discord_id": discord_id})
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



