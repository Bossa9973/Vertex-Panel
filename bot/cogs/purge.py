"""
purge.py — Vertex Bot — Inactive Free VPS Purge System
======================================================
Slash command: /purge-inactive

Flow:
1. Admin runs /purge-inactive -> selects Proxmox node from dropdown.
2. Bot queries panel API GET /api/bot/purge/servers?node_id=X for free-tier servers.
3. Bot DMs every free-tier server owner warning about inactivity (3-hour deadline).
   - IMPORTANT: The DM does NOT mention admin/staff, only inactivity.
   - Notifies that if not confirmed, the VPS is permanently deleted and admins cannot do anything.
4. If not confirmed at t = 2h30m (30 mins before deadline), bot sends a final 30-min warning DM.
5. At t = 3h, unconfirmed servers are marked inactive.
6. Admin reviews a paginated interactive embed (Active vs Inactive servers).
7. Admin clicks [Delete Inactive VPS] -> bot calls panel API POST /api/bot/admin/delete-vm
   to permanently remove hypervisor VMs and database records.
8. State persists in bot/data/purge_sessions.json across restarts.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import time
from typing import Any, Dict, List, Optional

import discord
from discord import app_commands
from discord.ext import commands

import panel_api

ACCENT  = 0x5865F2
SUCCESS = 0x57F287
WARNING = 0xFEE75C
DANGER  = 0xED4245

ADMIN_ROLE_ID = int(os.getenv("DISCORD_ADMIN_ROLE_ID", "1354830877149888744"))
RELOCATION_ADMIN_ROLE_ID = 1354830881537396796

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "purge_sessions.json")
DEFAULT_PURGE_HOURS = 3.0
ITEMS_PER_PAGE = 5


def is_admin(user: discord.Member | discord.User) -> bool:
    """Check if a user is an administrator or has an administrative staff role."""
    if getattr(getattr(user, "guild_permissions", None), "administrator", False):
        return True
    roles = getattr(user, "roles", [])
    admin_roles = {ADMIN_ROLE_ID, RELOCATION_ADMIN_ROLE_ID}
    return any(getattr(r, "id", None) in admin_roles for r in roles)


def load_sessions() -> Dict[str, Any]:
    """Load persistent purge sessions from disk."""
    if not os.path.exists(DATA_FILE):
        return {}
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[Purge] Failed to load {DATA_FILE}: {e}")
        return {}


def save_sessions(sessions: Dict[str, Any]) -> None:
    """Save persistent purge sessions to disk."""
    try:
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(sessions, f, indent=2)
    except Exception as e:
        print(f"[Purge] Failed to save {DATA_FILE}: {e}")


# ════════════════════════════════════════════════════════════════
# DM Confirmation Views & Embeds
# ════════════════════════════════════════════════════════════════

def make_dm_initial_embed(srv: Dict[str, Any], deadline_at: float) -> discord.Embed:
    """DM #1: Initial notice sent to free VPS owners upon purge initiation."""
    deadline_ts = int(deadline_at)
    embed = discord.Embed(
        title="⚠️ VPS Inactivity Notice — Action Required",
        color=WARNING,
        description=(
            f"Your VPS **{srv['name']}** has been flagged for inactivity.\n\n"
            f"To keep your server active and prevent deletion, you must confirm that you are "
            f"still actively using it within **3 hours**.\n\n"
            f"⏰ **Confirmation Deadline:** <t:{deadline_ts}:R> (<t:{deadline_ts}:F>)\n\n"
            f"⚠️ **Critical Irreversible Action:**\n"
            f"If you do not click the confirmation button below before the deadline, your VPS "
            f"will be **permanently and irreversibly deleted**. Once deleted, **admins cannot "
            f"recover your VPS or do anything about it** — all data and configurations will be permanently gone."
        ),
    )
    embed.add_field(name="🖥️ Server", value=f"`{srv['name']}` (VMID: `{srv['vmid']}`)", inline=True)
    embed.add_field(name="📍 Node", value=f"`{srv['node_name']}`", inline=True)
    cpu = srv.get("cpu", 1)
    ram = srv.get("memory_mb", 1024)
    disk = srv.get("disk_mb", 10)
    embed.add_field(name="⚙️ Resources", value=f"`{cpu}` vCPU · `{ram}` MB RAM · `{disk}` MB Disk", inline=False)
    embed.set_footer(text="Automated system inactivity notice • Permanent deletion on expiry")
    return embed


def make_dm_warning_embed(srv: Dict[str, Any], deadline_at: float) -> discord.Embed:
    """DM #2: Final 30-minute warning sent to unconfirmed owners."""
    deadline_ts = int(deadline_at)
    embed = discord.Embed(
        title="🚨 FINAL WARNING: 30 Minutes Until VPS Deletion",
        color=DANGER,
        description=(
            f"This is your **final alert** regarding inactivity on VPS **{srv['name']}**.\n\n"
            f"Your server is scheduled for **permanent deletion in 30 minutes**.\n\n"
            f"⏰ **Permanent Deletion Deadline:** <t:{deadline_ts}:R> (<t:{deadline_ts}:F>)\n\n"
            f"⚠️ **Last Chance to Keep Your Server:**\n"
            f"If you do not confirm activity before the timer runs out, your VPS and all stored "
            f"data will be wiped completely. **Admins cannot recover your VPS or do anything "
            f"about it after deletion.** Click the confirmation button below immediately."
        ),
    )
    embed.add_field(name="🖥️ Server", value=f"`{srv['name']}` (VMID: `{srv['vmid']}`)", inline=True)
    embed.add_field(name="📍 Node", value=f"`{srv['node_name']}`", inline=True)
    embed.set_footer(text="Final automated warning • Immediate irreversible deletion on deadline")
    return embed


def make_dm_confirmed_embed(srv: Dict[str, Any]) -> discord.Embed:
    """Embed shown when owner successfully confirms activity."""
    embed = discord.Embed(
        title="✅ VPS Activity Confirmed",
        color=SUCCESS,
        description=(
            f"You have successfully verified activity for VPS **{srv['name']}** (VMID: `{srv['vmid']}`).\n\n"
            f"Your server has been marked as **ACTIVE** and is safe from deletion."
        ),
    )
    embed.set_footer(text="Activity confirmed • Thank you for keeping your VPS active!")
    return embed


class DmConfirmView(discord.ui.View):
    """Button view attached to DMs sent to VPS owners."""

    def __init__(self, session_id: str, server_id: str | int):
        super().__init__(timeout=None)
        custom_id = f"purge_confirm:{session_id}:{server_id}"
        self.add_item(
            discord.ui.Button(
                label="✅ Confirm Activity — Keep My VPS",
                style=discord.ButtonStyle.success,
                custom_id=custom_id,
            )
        )


# ════════════════════════════════════════════════════════════════
# Admin Dashboard Embed & Views
# ════════════════════════════════════════════════════════════════

def make_dashboard_embed(session: Dict[str, Any], page: int = 0) -> discord.Embed:
    """Format the paginated admin review embed."""
    node_name = session.get("node_name", "Unknown")
    started_at = int(session.get("started_at", time.time()))
    deadline_at = int(session.get("deadline_at", time.time()))
    status = session.get("status", "running")
    now = time.time()

    servers_dict: Dict[str, Any] = session.get("servers", {})
    all_servers = list(servers_dict.values())
    total_count = len(all_servers)

    confirmed_servers = [s for s in all_servers if s.get("confirmed")]
    deleted_servers = [s for s in all_servers if s.get("deleted")]
    inactive_servers = [s for s in all_servers if not s.get("confirmed") and not s.get("deleted")]

    confirmed_count = len(confirmed_servers)
    deleted_count = len(deleted_servers)
    inactive_count = len(inactive_servers)

    # Determine status header text
    if status == "deleted":
        status_line = "✅ **Purge Executed** — Inactive servers have been deleted from the panel."
        color = SUCCESS if inactive_count == 0 else WARNING
    elif now >= deadline_at or status == "ready_for_deletion":
        status_line = f"🚨 **Inactivity Window Expired** (<t:{deadline_at}:R>)\nUnconfirmed servers are marked inactive and ready for deletion."
        color = DANGER
    else:
        status_line = f"⏱️ **Inactivity Window Running** — Ends <t:{deadline_at}:R> (<t:{deadline_at}:F>)"
        color = ACCENT

    embed = discord.Embed(
        title=f"🧹 Inactive VPS Purge Dashboard — {node_name}",
        color=color,
        description=(
            f"{status_line}\n\n"
            f"📊 **Summary:**\n"
            f"• Total Free Servers: `{total_count}`\n"
            f"• 🟢 Active / Confirmed: `{confirmed_count}`\n"
            f"• 🔴 Inactive / Unconfirmed: `{inactive_count}`\n"
            f"• 🗑️ Deleted: `{deleted_count}`\n"
            f"• Initiated: <t:{started_at}:R>"
        ),
    )

    # Sort servers: Inactive first, then Active, then Deleted
    sorted_servers = sorted(
        all_servers,
        key=lambda s: (
            1 if s.get("deleted") else (2 if s.get("confirmed") else 0)
        ),
    )

    total_pages = max(1, math.ceil(total_count / ITEMS_PER_PAGE))
    page = max(0, min(page, total_pages - 1))
    start_idx = page * ITEMS_PER_PAGE
    end_idx = start_idx + ITEMS_PER_PAGE
    page_items = sorted_servers[start_idx:end_idx]

    if not page_items:
        embed.add_field(name="No Servers", value="No free servers found on this node.", inline=False)
    else:
        for idx, s in enumerate(page_items, start=start_idx + 1):
            owner_disc = s.get("owner_discord_id")
            owner_mention = f"<@{owner_disc}>" if owner_disc else f"`{s.get('owner_name', 'Unknown')}`"
            specs = f"{s.get('cpu', 1)} vCPU · {s.get('memory_mb', 1024)} MB RAM · {s.get('disk_mb', 10)} MB Disk"

            if s.get("deleted"):
                badge = "🗑️ **[DELETED]**"
                state_desc = "Server removed via panel API"
            elif s.get("confirmed"):
                conf_at = s.get("confirmed_at")
                conf_time_str = f" at <t:{int(conf_at)}:T>" if conf_at else ""
                badge = f"🟢 **[ACTIVE — Confirmed{conf_time_str}]**"
                state_desc = "Owner confirmed activity"
            elif now >= deadline_at or status == "ready_for_deletion":
                badge = "🔴 **[INACTIVE — ELIGIBLE FOR DELETION]**"
                state_desc = "No response within 3 hours"
            else:
                dm_st = "DM sent" if s.get("dm_sent") else (s.get("dm_error") or "Pending DM")
                badge = f"🟡 **[PENDING — {dm_st}]**"
                state_desc = "Waiting for owner confirmation"

            field_name = f"#{idx} `{s.get('name')}` (VMID: `{s.get('vmid')}`)"
            field_value = (
                f"{badge}\n"
                f"├ Owner: {owner_mention}\n"
                f"├ Specs: `{specs}`\n"
                f"└ Details: {state_desc}"
            )
            embed.add_field(name=field_name, value=field_value, inline=False)

    embed.set_footer(text=f"Page {page + 1} of {total_pages} • Session ID: {session.get('session_id')}")
    return embed


class AdminDashboardView(discord.ui.View):
    """Interactive paginated view for the admin purge dashboard."""

    def __init__(self, cog: "Purge", session_id: str, current_page: int = 0):
        super().__init__(timeout=None)
        self.cog = cog
        self.session_id = session_id
        self.current_page = current_page
        self._update_buttons()

    def _get_session(self) -> Optional[Dict[str, Any]]:
        return self.cog.sessions.get(self.session_id)

    def _update_buttons(self) -> None:
        session = self._get_session()
        if not session:
            return

        total_count = len(session.get("servers", {}))
        total_pages = max(1, math.ceil(total_count / ITEMS_PER_PAGE))

        # Update Prev/Next button states
        self.prev_button.disabled = self.current_page <= 0
        self.next_button.disabled = self.current_page >= total_pages - 1
        self.page_indicator.label = f"{self.current_page + 1}/{total_pages}"

        # Count unconfirmed/inactive servers
        now = time.time()
        deadline_at = session.get("deadline_at", 0)
        inactive = [
            s for s in session.get("servers", {}).values()
            if not s.get("confirmed") and not s.get("deleted")
        ]
        unconfirmed_count = len(inactive)

        # Delete button state
        self.delete_button.label = f"🗑️ Delete Inactive ({unconfirmed_count})"
        self.delete_button.disabled = (unconfirmed_count == 0)

    @discord.ui.button(label="◀", style=discord.ButtonStyle.secondary, row=0)
    async def prev_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_admin(interaction.user):
            return await interaction.response.send_message("❌ Admin permission required.", ephemeral=True)
        session = self._get_session()
        if not session:
            return await interaction.response.send_message("❌ Session not found.", ephemeral=True)

        if self.current_page > 0:
            self.current_page -= 1
        self._update_buttons()
        embed = make_dashboard_embed(session, self.current_page)
        await interaction.response.edit_message(embed=embed, view=self)

    @discord.ui.button(label="1/1", style=discord.ButtonStyle.secondary, disabled=True, row=0)
    async def page_indicator(self, interaction: discord.Interaction, button: discord.ui.Button):
        pass

    @discord.ui.button(label="▶", style=discord.ButtonStyle.secondary, row=0)
    async def next_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_admin(interaction.user):
            return await interaction.response.send_message("❌ Admin permission required.", ephemeral=True)
        session = self._get_session()
        if not session:
            return await interaction.response.send_message("❌ Session not found.", ephemeral=True)

        total_count = len(session.get("servers", {}))
        total_pages = max(1, math.ceil(total_count / ITEMS_PER_PAGE))
        if self.current_page < total_pages - 1:
            self.current_page += 1
        self._update_buttons()
        embed = make_dashboard_embed(session, self.current_page)
        await interaction.response.edit_message(embed=embed, view=self)

    @discord.ui.button(label="🔄 Refresh", style=discord.ButtonStyle.primary, row=0)
    async def refresh_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_admin(interaction.user):
            return await interaction.response.send_message("❌ Admin permission required.", ephemeral=True)
        session = self._get_session()
        if not session:
            return await interaction.response.send_message("❌ Session not found.", ephemeral=True)

        self._update_buttons()
        embed = make_dashboard_embed(session, self.current_page)
        await interaction.response.edit_message(embed=embed, view=self)

    @discord.ui.button(label="🗑️ Delete Inactive", style=discord.ButtonStyle.danger, row=1)
    async def delete_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_admin(interaction.user):
            return await interaction.response.send_message("❌ Admin permission required.", ephemeral=True)
        session = self._get_session()
        if not session:
            return await interaction.response.send_message("❌ Session not found.", ephemeral=True)

        inactive = [
            s for s in session.get("servers", {}).values()
            if not s.get("confirmed") and not s.get("deleted")
        ]
        if not inactive:
            return await interaction.response.send_message("ℹ️ There are no inactive servers to delete.", ephemeral=True)

        # Show confirmation view
        confirm_view = DeleteConfirmView(self.cog, self.session_id, len(inactive), self)
        await interaction.response.send_message(
            f"⚠️ **CONFIRM PERMANENT DELETION**\n"
            f"You are about to permanently delete **{len(inactive)}** inactive VPS servers on node "
            f"**{session.get('node_name')}** via the panel API.\n\n"
            f"• All hypervisor VMs will be uninstalled or wiped.\n"
            f"• All database records and addresses will be deleted.\n"
            f"• **This action cannot be undone!**\n\n"
            f"Are you sure you want to proceed?",
            view=confirm_view,
            ephemeral=True,
        )

    @discord.ui.button(label="⏹️ Cancel Purge", style=discord.ButtonStyle.secondary, row=1)
    async def cancel_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_admin(interaction.user):
            return await interaction.response.send_message("❌ Admin permission required.", ephemeral=True)
        session = self._get_session()
        if not session:
            return await interaction.response.send_message("❌ Session not found.", ephemeral=True)

        session["status"] = "cancelled"
        self.cog.save_state()
        for item in self.children:
            item.disabled = True
        embed = make_dashboard_embed(session, self.current_page)
        embed.title = f"⏹️ Purge Session Cancelled — {session.get('node_name')}"
        await interaction.response.edit_message(embed=embed, view=self)
        await interaction.followup.send("⏹️ Purge session has been cancelled.", ephemeral=True)


class DeleteConfirmView(discord.ui.View):
    """Confirmation view before deleting inactive VPS instances."""

    def __init__(self, cog: "Purge", session_id: str, count: int, parent_view: AdminDashboardView):
        super().__init__(timeout=60.0)
        self.cog = cog
        self.session_id = session_id
        self.count = count
        self.parent_view = parent_view

    @discord.ui.button(label="💥 Yes, Purge & Delete All", style=discord.ButtonStyle.danger)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not is_admin(interaction.user):
            return await interaction.response.send_message("❌ Admin permission required.", ephemeral=True)

        self.clear_items()
        await interaction.response.edit_message(
            content=f"⚙️ **Initiating deletion of {self.count} inactive servers...**",
            view=None,
        )

        # Trigger deletion asynchronously
        asyncio.create_task(
            self.cog.execute_deletion(self.session_id, str(interaction.user.id), interaction.channel)
        )

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.clear_items()
        await interaction.response.edit_message(content="❌ Deletion cancelled.", view=None)


class NodeSelect(discord.ui.Select):
    """Dropdown menu for admin to select which Proxmox node to purge."""

    def __init__(self, cog: "Purge", nodes: List[Dict[str, Any]], hours: float = DEFAULT_PURGE_HOURS):
        options = []
        for n in nodes[:25]:
            nid = str(n.get("id"))
            name = n.get("name", f"Node #{nid}")
            options.append(discord.SelectOption(label=f"{name} (#{nid})", value=nid, description=f"Target node ID {nid}"))

        super().__init__(
            placeholder="Select a Proxmox node to scan for inactive free VPS...",
            min_values=1,
            max_values=1,
            options=options,
        )
        self.cog = cog
        self.hours = hours

    async def callback(self, interaction: discord.Interaction):
        if not is_admin(interaction.user):
            return await interaction.response.send_message("❌ Admin permission required.", ephemeral=True)

        node_id = int(self.values[0])
        await interaction.response.defer()

        await self.cog.start_purge_session(interaction, node_id, self.hours)


class NodeSelectView(discord.ui.View):
    """View holding the NodeSelect dropdown."""

    def __init__(self, cog: "Purge", nodes: List[Dict[str, Any]], hours: float = DEFAULT_PURGE_HOURS):
        super().__init__(timeout=120.0)
        self.add_item(NodeSelect(cog, nodes, hours))

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(content="❌ Purge command cancelled.", view=None)


# ════════════════════════════════════════════════════════════════
# Main Purge Cog
# ════════════════════════════════════════════════════════════════

class Purge(commands.Cog):
    """Inactive Free VPS Purge System — alerts owners, marks inactive, and deletes servers."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.sessions: Dict[str, Any] = load_sessions()
        self.active_tasks: Dict[str, asyncio.Task] = {}

    def save_state(self) -> None:
        save_sessions(self.sessions)

    async def cog_load(self) -> None:
        """Resume running sessions on bot boot."""
        now = time.time()
        for session_id, session in list(self.sessions.items()):
            if session.get("status") == "running":
                deadline_at = session.get("deadline_at", 0)
                if now >= deadline_at:
                    session["status"] = "ready_for_deletion"
                    print(f"[Purge] Session {session_id} expired while bot was offline. Marked ready for deletion.")
                else:
                    task = asyncio.create_task(self._run_session_timer(session_id))
                    self.active_tasks[session_id] = task
                    print(f"[Purge] Resumed timer for active session {session_id} (deadline: {int(deadline_at - now)}s).")
        self.save_state()

    async def cog_unload(self) -> None:
        """Cancel background timers on unload."""
        for task in self.active_tasks.values():
            task.cancel()
        self.active_tasks.clear()

    # ────────────────────────────────────────────────────────────
    # Slash Command: /purge-inactive
    # ────────────────────────────────────────────────────────────

    @app_commands.command(
        name="purge-inactive",
        description="Scan a Proxmox node for free VPS instances, DM owners for inactivity, and purge unconfirmed servers.",
    )
    @app_commands.describe(
        hours="Inactivity confirmation window in hours (default: 3.0)",
    )
    async def purge_inactive(self, interaction: discord.Interaction, hours: Optional[float] = None) -> None:
        if not is_admin(interaction.user):
            embed = discord.Embed(
                color=DANGER,
                title="Access Denied",
                description=f"❌ You must be an Administrator or have the staff role <@&{ADMIN_ROLE_ID}> to run `/purge-inactive`.",
            )
            return await interaction.response.send_message(embed=embed, ephemeral=True)

        purge_hours = float(hours) if (hours and hours > 0) else DEFAULT_PURGE_HOURS

        await interaction.response.defer(ephemeral=False)

        # Fetch Proxmox nodes from panel API
        try:
            nodes = await panel_api.get_nodes()
        except Exception as e:
            embed = discord.Embed(
                color=DANGER,
                title="Failed to Fetch Nodes",
                description=f"Could not contact panel API: `{e}`",
            )
            return await interaction.followup.send(embed=embed)

        if not nodes:
            embed = discord.Embed(
                color=WARNING,
                title="No Nodes Found",
                description="No Proxmox nodes were returned by the panel API.",
            )
            return await interaction.followup.send(embed=embed)

        embed = discord.Embed(
            color=ACCENT,
            title="🧹 Inactive Free VPS Purge System",
            description=(
                "Select a Proxmox node below to scan for **free-tier** servers.\n\n"
                f"• Owners will receive an automated inactivity notice with a **{purge_hours:g}-hour** deadline.\n"
                f"• A final warning will be sent **30 minutes** before the deadline.\n"
                f"• Unconfirmed servers will be flagged inactive for deletion.\n"
                f"• Admins can review the interactive pagination dashboard and execute deletion."
            ),
        )
        embed.set_footer(text="Notice messages do not mention staff • Inactivity verification only")
        view = NodeSelectView(self, nodes, purge_hours)
        await interaction.followup.send(embed=embed, view=view)

    # ────────────────────────────────────────────────────────────
    # Start Session & DM Notification
    # ────────────────────────────────────────────────────────────

    async def start_purge_session(self, interaction: discord.Interaction, node_id: int, hours: float) -> None:
        """Query free servers on the node, initialize session, DM owners, and launch timer."""
        res = await panel_api.get_purge_servers(node_id)
        if not res.get("ok"):
            err = res.get("error", "Unknown API error")
            embed = discord.Embed(color=DANGER, title="API Error", description=f"Failed to fetch servers: `{err}`")
            return await interaction.edit_original_response(content=None, embed=embed, view=None)

        servers = res.get("servers", [])
        node_name = res.get("node_name", f"Node #{node_id}")

        if not servers:
            embed = discord.Embed(
                color=WARNING,
                title="No Free Servers Found",
                description=f"There are no free-tier servers on **{node_name}**.",
            )
            return await interaction.edit_original_response(content=None, embed=embed, view=None)

        now = time.time()
        duration_seconds = hours * 3600.0
        deadline_at = now + duration_seconds
        session_id = f"{node_id}_{int(now)}"

        # Construct servers dictionary
        servers_dict: Dict[str, Any] = {}
        for s in servers:
            sid = str(s["id"])
            servers_dict[sid] = {
                "id": s["id"],
                "name": s.get("name", f"VPS-{sid}"),
                "vmid": s.get("vmid", sid),
                "uuid": s.get("uuid", ""),
                "node_id": s.get("node_id", node_id),
                "node_name": s.get("node_name", node_name),
                "owner_id": s.get("owner_id"),
                "owner_name": s.get("owner_name", "Unknown"),
                "owner_discord_id": s.get("owner_discord_id"),
                "cpu": s.get("cpu", 1),
                "memory_mb": s.get("memory_mb", 1024),
                "disk_mb": s.get("disk_mb", 10),
                "status": s.get("status"),
                "confirmed": False,
                "confirmed_at": None,
                "dm_sent": False,
                "dm_error": None,
                "warn_sent": False,
                "deleted": False,
                "delete_error": None,
            }

        session_data: Dict[str, Any] = {
            "session_id": session_id,
            "node_id": node_id,
            "node_name": node_name,
            "admin_id": interaction.user.id,
            "channel_id": interaction.channel_id,
            "message_id": None,
            "hours": hours,
            "started_at": now,
            "deadline_at": deadline_at,
            "status": "running",
            "servers": servers_dict,
        }

        self.sessions[session_id] = session_data
        self.save_state()

        # Send initial response to acknowledge admin
        working_embed = discord.Embed(
            color=ACCENT,
            title="⏳ Dispatching Inactivity Notices...",
            description=f"Sending inactivity DMs to **{len(servers_dict)}** free server owners on **{node_name}**...",
        )
        await interaction.edit_original_response(content=None, embed=working_embed, view=None)

        # Dispatch DM #1 to owners
        asyncio.create_task(self._dispatch_initial_dms(session_id, interaction))

        # Launch timer task
        task = asyncio.create_task(self._run_session_timer(session_id))
        self.active_tasks[session_id] = task

    async def _dispatch_initial_dms(self, session_id: str, interaction: discord.Interaction) -> None:
        """Send DM #1 to all free server owners."""
        session = self.sessions.get(session_id)
        if not session:
            return

        deadline_at = session.get("deadline_at", time.time() + 10800)
        servers_dict = session.get("servers", {})

        sent_count = 0
        failed_count = 0

        for sid, srv in list(servers_dict.items()):
            discord_id = srv.get("owner_discord_id")
            if not discord_id:
                srv["dm_sent"] = False
                srv["dm_error"] = "No Discord account linked"
                failed_count += 1
                continue

            try:
                user = await self.bot.fetch_user(int(discord_id))
                embed = make_dm_initial_embed(srv, deadline_at)
                view = DmConfirmView(session_id, sid)
                await user.send(embed=embed, view=view)
                srv["dm_sent"] = True
                sent_count += 1
            except discord.Forbidden:
                srv["dm_sent"] = False
                srv["dm_error"] = "DMs disabled by user"
                failed_count += 1
            except Exception as ex:
                srv["dm_sent"] = False
                srv["dm_error"] = str(ex)
                failed_count += 1

            # Brief pause to stay well under Discord rate limits
            await asyncio.sleep(0.3)

        self.save_state()

        # Build and send dashboard embed
        dashboard_embed = make_dashboard_embed(session, page=0)
        dashboard_view = AdminDashboardView(self, session_id, current_page=0)
        msg = await interaction.edit_original_response(embed=dashboard_embed, view=dashboard_view)
        session["message_id"] = msg.id
        self.save_state()

    # ────────────────────────────────────────────────────────────
    # Background Session Timer & 30-Minute Warning
    # ────────────────────────────────────────────────────────────

    async def _run_session_timer(self, session_id: str) -> None:
        """Track purge session: send 30-min warning alert, then expire at deadline."""
        session = self.sessions.get(session_id)
        if not session:
            return

        deadline_at = session.get("deadline_at", time.time())
        warn_at = deadline_at - 1800.0  # 30 minutes before deadline

        # 1. Wait until 30-min warning window
        now = time.time()
        time_to_warn = warn_at - now
        if time_to_warn > 0:
            try:
                await asyncio.sleep(time_to_warn)
            except asyncio.CancelledError:
                return

        # 2. Dispatch DM #2: 30-minute final warning to unconfirmed servers
        session = self.sessions.get(session_id)
        if session and session.get("status") == "running":
            await self._dispatch_warning_dms(session_id)

        # 3. Wait until final deadline
        now = time.time()
        time_to_deadline = deadline_at - now
        if time_to_deadline > 0:
            try:
                await asyncio.sleep(time_to_deadline)
            except asyncio.CancelledError:
                return

        # 4. Inactivity window complete — mark ready for deletion
        session = self.sessions.get(session_id)
        if session and session.get("status") == "running":
            session["status"] = "ready_for_deletion"
            self.save_state()

            # Notify admin channel
            channel_id = session.get("channel_id")
            admin_id = session.get("admin_id")
            node_name = session.get("node_name")
            inactive_count = len([
                s for s in session.get("servers", {}).values()
                if not s.get("confirmed") and not s.get("deleted")
            ])

            if channel_id:
                try:
                    channel = self.bot.get_channel(channel_id) or await self.bot.fetch_channel(channel_id)
                    if channel:
                        await channel.send(
                            f"🔔 <@{admin_id}> **Inactivity Window Expired for Node `{node_name}`!**\n"
                            f"The 3-hour confirmation period has ended.\n"
                            f"• **{inactive_count}** unconfirmed servers are marked inactive and eligible for deletion.\n"
                            f"• Review the dashboard above and click **[🗑️ Delete Inactive VPS]** to execute deletion.",
                        )
                except Exception as e:
                    print(f"[Purge] Failed to notify admin channel {channel_id}: {e}")

            # Refresh the dashboard embed
            await self.refresh_dashboard_message(session_id)

    async def _dispatch_warning_dms(self, session_id: str) -> None:
        """Send DM #2 (30-min final warning) to all unconfirmed owners."""
        session = self.sessions.get(session_id)
        if not session:
            return

        deadline_at = session.get("deadline_at", time.time())
        servers_dict = session.get("servers", {})

        for sid, srv in list(servers_dict.items()):
            if srv.get("confirmed") or srv.get("deleted") or srv.get("warn_sent"):
                continue

            discord_id = srv.get("owner_discord_id")
            if not discord_id:
                continue

            try:
                user = await self.bot.fetch_user(int(discord_id))
                embed = make_dm_warning_embed(srv, deadline_at)
                view = DmConfirmView(session_id, sid)
                await user.send(embed=embed, view=view)
                srv["warn_sent"] = True
            except Exception as ex:
                print(f"[Purge] Warning DM failed for server {sid} (user {discord_id}): {ex}")

            await asyncio.sleep(0.3)

        self.save_state()

    # ────────────────────────────────────────────────────────────
    # Owner Confirmation Button Handler
    # ────────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_interaction(self, interaction: discord.Interaction) -> None:
        """Handle component clicks, specifically DM confirmation buttons."""
        if interaction.type != discord.InteractionType.component:
            return

        custom_id = interaction.data.get("custom_id", "")
        if not custom_id.startswith("purge_confirm:"):
            return

        parts = custom_id.split(":")
        if len(parts) != 3:
            return

        _, session_id, server_id = parts
        session = self.sessions.get(session_id)
        if not session:
            return await interaction.response.send_message(
                "❌ This purge session has ended or is no longer active.",
                ephemeral=True,
            )

        servers_dict = session.get("servers", {})
        srv = servers_dict.get(str(server_id))
        if not srv:
            return await interaction.response.send_message("❌ Server record not found.", ephemeral=True)

        if srv.get("deleted"):
            return await interaction.response.send_message(
                "❌ The confirmation deadline for this VPS has expired and the server has been deleted.",
                ephemeral=True,
            )

        if srv.get("confirmed"):
            return await interaction.response.send_message(
                "✅ You have already confirmed activity for this VPS! Your server is safe.",
                ephemeral=True,
            )

        # Mark confirmed
        srv["confirmed"] = True
        srv["confirmed_at"] = time.time()
        self.save_state()

        # Update the owner's DM view and message
        conf_embed = make_dm_confirmed_embed(srv)
        try:
            await interaction.response.send_message(
                f"✅ **Activity confirmed!** Your VPS **{srv['name']}** has been verified and will not be deleted.",
                ephemeral=True,
            )
        except Exception:
            pass

        try:
            if interaction.message:
                await interaction.message.edit(embed=conf_embed, view=None)
        except Exception as e:
            print(f"[Purge] Failed to edit DM message for server {server_id}: {e}")

        # Live refresh of the admin dashboard embed
        asyncio.create_task(self.refresh_dashboard_message(session_id))

    # ────────────────────────────────────────────────────────────
    # Deletion Execution via Panel API
    # ────────────────────────────────────────────────────────────

    async def execute_deletion(self, session_id: str, admin_discord_id: str, channel: Any) -> None:
        """Execute deletion of all inactive servers in sequence."""
        session = self.sessions.get(session_id)
        if not session:
            return

        servers_dict = session.get("servers", {})
        inactive_servers = [
            s for s in servers_dict.values()
            if not s.get("confirmed") and not s.get("deleted")
        ]

        if not inactive_servers:
            return

        total_to_delete = len(inactive_servers)
        deleted_count = 0
        failed_count = 0
        node_name = session.get("node_name", "Unknown")

        progress_msg = None
        if channel:
            try:
                progress_msg = await channel.send(
                    f"⚙️ **Purging {total_to_delete} inactive VPS servers on `{node_name}`...** (0 / {total_to_delete})"
                )
            except Exception:
                pass

        for idx, srv in enumerate(inactive_servers, start=1):
            sid = str(srv["id"])
            user_discord_id = str(srv.get("owner_discord_id") or "0")

            try:
                res = await panel_api.delete_vm(
                    server_id=sid,
                    admin_discord_id=admin_discord_id,
                    user_discord_id=user_discord_id,
                    force=False,
                )

                if res.get("ok"):
                    srv["deleted"] = True
                    srv["delete_error"] = None
                    deleted_count += 1
                else:
                    err = res.get("error", "Unknown panel error")
                    srv["delete_error"] = err
                    failed_count += 1
            except Exception as e:
                srv["delete_error"] = str(e)
                failed_count += 1

            self.save_state()

            # Update progress every 3 servers or on final
            if progress_msg and (idx % 3 == 0 or idx == total_to_delete):
                try:
                    await progress_msg.edit(
                        content=f"⚙️ **Purging inactive VPS servers on `{node_name}`...** ({idx} / {total_to_delete})"
                    )
                except Exception:
                    pass

            await asyncio.sleep(0.5)

        session["status"] = "deleted"
        self.save_state()

        # Final completion notification
        if channel:
            report_embed = discord.Embed(
                title=f"✅ Inactive VPS Purge Completed — {node_name}",
                color=SUCCESS if failed_count == 0 else WARNING,
                description=(
                    f"Finished purging inactive free-tier servers on **{node_name}**.\n\n"
                    f"• 🗑️ **Deleted Successfully:** `{deleted_count}`\n"
                    f"• ❌ **Failed:** `{failed_count}`\n"
                    f"• 🟢 **Preserved (Active):** `{len(servers_dict) - total_to_delete}`"
                ),
            )
            try:
                if progress_msg:
                    await progress_msg.edit(content=None, embed=report_embed)
                else:
                    await channel.send(embed=report_embed)
            except Exception:
                pass

        # Update the main dashboard embed to page 0
        await self.refresh_dashboard_message(session_id)

    async def refresh_dashboard_message(self, session_id: str) -> None:
        """Update the admin dashboard embed in Discord."""
        session = self.sessions.get(session_id)
        if not session:
            return

        channel_id = session.get("channel_id")
        message_id = session.get("message_id")
        if not channel_id or not message_id:
            return

        try:
            channel = self.bot.get_channel(channel_id) or await self.bot.fetch_channel(channel_id)
            if not channel:
                return
            msg = await channel.fetch_message(message_id)
            if not msg:
                return

            embed = make_dashboard_embed(session, page=0)
            view = AdminDashboardView(self, session_id, current_page=0)
            await msg.edit(embed=embed, view=view)
        except Exception as e:
            print(f"[Purge] Could not refresh dashboard message {message_id}: {e}")


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Purge(bot))
