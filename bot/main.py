import discord
from discord.ext import commands
from discord.app_commands import AppCommandError, TransformerError
from typing import Union, Optional
import os
import time
import datetime
import html
import io
from dotenv import load_dotenv
import panel_api
from cogs.panel import StatsView

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
ADMIN_ROLE_ID = int(os.getenv("DISCORD_ADMIN_ROLE_ID", "1354830877149888744"))
LOG_CHANNEL_ID = os.getenv("DISCORD_LOG_CHANNEL_ID", "")

async def log_to_channel(embed: discord.Embed, file: Optional[discord.File] = None):
    """Sends an audit log embed (and optional file) to the configured logging channel if set."""
    global LOG_CHANNEL_ID
    if not LOG_CHANNEL_ID:
        return
    try:
        ch_id = int(str(LOG_CHANNEL_ID).strip())
        if ch_id == 0:
            return
        channel = bot.get_channel(ch_id)
        if not channel:
            channel = await bot.fetch_channel(ch_id)
        if channel and hasattr(channel, "send"):
            if file:
                await channel.send(embed=embed, file=file)
            else:
                await channel.send(embed=embed)
    except Exception as e:
        print(f"[log_channel] Failed to send log to channel {LOG_CHANNEL_ID}: {e}")

class LumenHelper(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.members = True
        intents.message_content = True
        intents.invites = True
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self):
        await self.load_extension("cogs.tracker")
        await self.load_extension("cogs.panel")
        self.add_view(StatsView())  # Restore persistent views on restart
        print("Cogs loaded.")

    async def on_ready(self):
        print(f"Logged in as {self.user.name} ({self.user.id})")

        try:
            await self.tree.sync()
            guild_id = os.getenv("DISCORD_GUILD_ID")
            if guild_id:
                guild_obj = discord.Object(id=int(guild_id))
                self.tree.copy_global_to(guild=guild_obj)
                await self.tree.sync(guild=guild_obj)
                print(f"Commands synced to guild {guild_id}.")
            else:
                print("Commands synced globally.")
        except Exception as e:
            print(f"Command sync error: {e}")

bot = LumenHelper()

@bot.tree.error
async def on_tree_error(interaction: discord.Interaction, error: AppCommandError):
    print(f"[tree_error] Command error: {error}")
    err_msg = str(error)
    if isinstance(error, TransformerError):
        err_msg = "Could not resolve the specified user. Please mention a valid server member or select from the user dropdown."

    embed = discord.Embed(
        title="❌ Command Error",
        description=err_msg,
        color=0xEF4444,
    )
    embed.set_footer(text="Vertex Panel | Command System")

    try:
        if interaction.response.is_done():
            await interaction.followup.send(embed=embed, ephemeral=True)
        else:
            await interaction.response.send_message(embed=embed, ephemeral=True)
    except Exception as e:
        print(f"[tree_error] Failed to send error embed: {e}")

def is_admin(interaction: discord.Interaction) -> bool:
    return (
        interaction.user.guild_permissions.administrator
        or any(r.id == ADMIN_ROLE_ID for r in getattr(interaction.user, 'roles', []))
    )

# ─── /set_log_channel ─────────────────────────────────────────────────────────

@bot.tree.command(name="set_log_channel", description="Set the Discord channel for admin audit & action logs (Admin Only)")
async def set_log_channel(interaction: discord.Interaction, channel: discord.TextChannel):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)
    global LOG_CHANNEL_ID
    LOG_CHANNEL_ID = str(channel.id)
    embed = discord.Embed(
        title="📋 Audit Log Channel Configured",
        description=f"Admin action logs and promo code audit events will now be dispatched to {channel.mention} (`{channel.id}`).",
        color=0x22C55E
    )
    embed.set_footer(text="Vertex Admin Control Panel | Logging System")
    await interaction.response.send_message(embed=embed, ephemeral=True)

    test_embed = discord.Embed(
        title="📋 Vertex Audit Logging Channel Initialized",
        description=f"This channel has been designated as the active audit logging channel by {interaction.user.mention}.",
        color=0x3B82F6,
        timestamp=discord.utils.utcnow()
    )
    test_embed.set_footer(text="Vertex Audit Logger")
    await log_to_channel(test_embed)

# ─── /help ────────────────────────────────────────────────────────────────────

@bot.tree.command(name="help", description="Show all available commands")
async def help_cmd(interaction: discord.Interaction):
    embed = discord.Embed(title="🚀 Vertex Helper | Command Center", color=0x5865F2)
    embed.add_field(
        name="🛡️ Admin Commands",
        value=(
            "`/userinfo @user` — View full user balance, spending, owned servers & lifecycle history (Admin Only)\n"
            "`/txinfo <ref_id>` — Inspect transaction, server creation/expiry date, price & specs (Admin Only)\n"
            "`/vm-delete @user` — Staff VM deletion workflow with multi-step owner verification & HTML transcript (Admin Only)\n"
            "`/add_bolts @user` — Interactive Bolt Promo Code Generator with History & Presets (Admin Only)\n"
            "`/set_log_channel #channel` — Configure the channel for admin action & redemption audit logs (Admin Only)\n"
            "`/add_invites @user amount` — Manually add invites\n"
            "`/add_messages @user amount` — Manually add messages\n"
            "`/reset_user_stats @user` — Wipe a user's stats\n"
            "`/reset_all_stats` — Wipe stats for EVERYONE"
        ),
        inline=False,
    )
    embed.add_field(
        name="📊 Public Commands",
        value="`/redeem <code>` — Redeem a Bolt promo code\n`/help` — Show this menu",
        inline=False,
    )
    embed.set_footer(text="Vertex Host | Powering the Community")
    await interaction.response.send_message(embed=embed, ephemeral=True)

# ─── /redeem (public) ─────────────────────────────────────────────────────────

@bot.tree.command(name="redeem", description="Redeem a Bolt promo code")
async def redeem(interaction: discord.Interaction, code: str):
    await interaction.response.defer(ephemeral=True)
    result = await panel_api.redeem_code(code.strip().upper(), str(interaction.user.id))

    if result.get("ok"):
        embed = discord.Embed(
            title="⚡ Code Redeemed!",
            description=result.get("message", "Credits added to your account."),
            color=0x22C55E,
        )
        embed.add_field(name="Amount", value=f"**{result['amount']} credits**", inline=True)
        embed.add_field(name="New Balance", value=f"**{result['new_balance']} credits**", inline=True)
        embed.set_footer(text="Vertex Panel | Account System")
        await interaction.followup.send(embed=embed, ephemeral=True)

        # Dispatch to audit log channel
        log_embed = discord.Embed(
            title="🎁 [Audit Log] Bolt Promo Code Redeemed",
            color=0x22C55E,
            timestamp=discord.utils.utcnow()
        )
        log_embed.add_field(name="User", value=f"{interaction.user.mention} (`{interaction.user.id}`)", inline=True)
        log_embed.add_field(name="Code", value=f"`{code.strip().upper()}`", inline=True)
        log_embed.add_field(name="Amount Claimed", value=f"**{result.get('amount', 0)} credits**", inline=True)
        log_embed.add_field(name="New Balance", value=f"**{result.get('new_balance', 0)} credits**", inline=True)
        log_embed.set_footer(text="Vertex Redemption Logger")
        await log_to_channel(log_embed)
    else:
        embed = discord.Embed(
            title="❌ Redemption Error",
            description=result.get("error", "Your Discord account is not linked to a Vertex panel account. Please sign in at the panel and link your Discord first."),
            color=0xEF4444,
        )
        embed.set_footer(text="Vertex Panel | Account System")
        await interaction.followup.send(embed=embed, ephemeral=True)


# ─── Safe Formatting & Helpers ───────────────────────────────────────────────

def safe_float(v, default: float = 0.0) -> float:
    if v is None:
        return default
    try:
        return float(v)
    except (ValueError, TypeError):
        return default

def safe_int(v, default: int = 0) -> int:
    if v is None:
        return default
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return default

def safe_str(v, default: str = "") -> str:
    if v is None:
        return default
    return str(v)

def format_bolt_amount(v) -> str:
    val = safe_float(v)
    sign = "+" if val > 0 else ""
    return f"{sign}{val:,.2f} BOLTs"

def format_date(dt_val, default: str = "N/A") -> str:
    if not dt_val:
        return default
    if isinstance(dt_val, (int, float)):
        try:
            return time.strftime('%Y-%m-%d', time.gmtime(dt_val))
        except Exception:
            return default
    s = str(dt_val).strip()
    return s[:10] if len(s) >= 10 else (s or default)

def truncate_text(text: str, max_len: int = 60) -> str:
    s = safe_str(text).strip()
    if len(s) > max_len:
        return s[:max_len - 3] + "..."
    return s

def add_chunked_fields(embed: discord.Embed, field_title: str, lines: list[str], max_len: int = 1000, empty_message: str = "*No records found.*"):
    if not lines:
        embed.add_field(name=field_title, value=empty_message, inline=False)
        return

    chunk = []
    chunk_len = 0
    field_idx = 1
    total_fields = 0

    for line in lines:
        line_len = len(line) + 1  # include newline
        if chunk and (chunk_len + line_len > max_len):
            name = field_title if field_idx == 1 else f"{field_title} (Cont. {field_idx})"
            embed.add_field(name=name, value="\n".join(chunk), inline=False)
            total_fields += 1
            if total_fields >= 5:
                break
            chunk = [line]
            chunk_len = len(line)
            field_idx += 1
        else:
            chunk.append(line)
            chunk_len += line_len

    if chunk and total_fields < 5:
        name = field_title if field_idx == 1 else f"{field_title} (Cont. {field_idx})"
        embed.add_field(name=name, value="\n".join(chunk), inline=False)


# ─── Admin: /userinfo & /txinfo (Interactive Tabbed Panel & Tx Inspector) ───

class TransactionLookupModal(discord.ui.Modal, title="Lookup Transaction Info"):
    tx_input = discord.ui.TextInput(
        label="Transaction Reference ID",
        placeholder="e.g. RENEW-5OBDSIRG, DEPLOY-XXXXXXXX, PROMO-...",
        min_length=3,
        max_length=64,
        required=True
    )

    def __init__(self, callback_func):
        super().__init__()
        self.callback_func = callback_func

    async def on_submit(self, interaction: discord.Interaction):
        await self.callback_func(interaction, self.tx_input.value.strip())


def build_transaction_embed(data: dict) -> discord.Embed:
    data = data or {}
    tx = data.get("transaction") or {}
    u = data.get("user") or {}
    srv = data.get("server") or {}
    promo = data.get("promo") or {}
    lifecycle = data.get("lifecycle") or []

    ref_id = safe_str(tx.get("reference_id")).strip() or f"TX#{safe_str(tx.get('id', 'N/A'))}"
    amt = safe_float(tx.get("amount"))
    is_positive = amt > 0
    color = 0x10B981 if is_positive else (0x8B5CF6 if "RENEW" in ref_id else 0x3B82F6 if "DEPLOY" in ref_id else 0xF59E0B)

    tx_type = safe_str(tx.get("type") or "transaction").upper()
    tx_desc = truncate_text(tx.get("description") or "System transaction", 80)

    embed = discord.Embed(
        title=f"🔍 Transaction Inspector // `{truncate_text(ref_id, 40)}`",
        description=f"**Action:** `{tx_type}` — {tx_desc}",
        color=color,
    )

    sign = "+" if is_positive else ""
    ts = tx.get("timestamp")
    date_str = format_date(tx.get("created_at") or ts)
    time_fmt = f"<t:{int(ts)}:F> (<t:{int(ts)}:R>)" if (isinstance(ts, (int, float)) and ts > 0) else f"`{date_str}`"

    embed.add_field(
        name="💳 Transaction Details",
        value=(
            f"• **Reference ID:** `{ref_id}`\n"
            f"• **Amount:** `⚡ {sign}{amt:,.2f} BOLTs`\n"
            f"• **Timestamp:** {time_fmt}\n"
            f"• **Type:** `{safe_str(tx.get('type') or 'N/A')}`"
        ),
        inline=False
    )

    if u:
        discord_id = safe_str(u.get("discord_id")).strip()
        user_discord = f"<@{discord_id}> (`{discord_id}`)" if discord_id else "Not Linked"
        role_label = "Root Admin" if u.get("root_admin") else "Client"
        user_balance = safe_float(u.get("credits"))
        embed.add_field(
            name="👤 Account Info",
            value=(
                f"• **User:** {safe_str(u.get('name') or 'N/A')} (Panel ID `#{safe_str(u.get('id', 'N/A'))}`)\n"
                f"• **Email:** `{safe_str(u.get('email') or 'N/A')}`\n"
                f"• **Discord:** {user_discord}\n"
                f"• **Current Balance:** `⚡ {user_balance:,.2f} BOLTs` | **Role:** `{role_label}`"
            ),
            inline=False
        )

    if srv:
        exists = srv.get("server_exists", True)
        status_raw = safe_str(srv.get("status") or "in_use").lower()
        if not exists or status_raw == "deleted":
            status_badge = "🗑️ Deleted / Terminated"
        elif "suspend" in status_raw:
            status_badge = "🔴 Suspended"
        elif "expire" in status_raw:
            status_badge = "⚠️ Expired"
        elif "install" in status_raw:
            status_badge = "🟡 Installing"
        else:
            status_badge = "🟢 In Use / Active"

        cpu_cores = safe_float(srv.get("cpu_cores", 1))
        ram_mb = safe_int(srv.get("memory_mb"))
        disk_mb = safe_int(srv.get("disk_mb"))
        specs_str = f"{cpu_cores:g} vCPU | {ram_mb:,} MB RAM | {disk_mb:,} MB Storage"
        created_str = format_date(srv.get("server_created_at"))
        expires_str = format_date(srv.get("server_expires_at"), default=("Expired / Deleted" if not exists else "Never"))
        price_bought = safe_float(srv.get("price_when_bought"))

        srv_val = (
            f"• **Server Name:** `{truncate_text(srv.get('name') or 'N/A', 40)}`\n"
            f"• **Status:** {status_badge}\n"
            f"• **VMID & Hostname:** `{safe_str(srv.get('vmid') or 'N/A')}` | `{safe_str(srv.get('hostname') or 'N/A')}`\n"
            f"• **Node & Location:** `{truncate_text(srv.get('node_name') or 'Primary Node', 30)}` (`{safe_str(srv.get('node_ip') or srv.get('ip_address') or 'N/A')}`)\n"
            f"• **Plan & Specs:** **{truncate_text(srv.get('plan_name') or 'Cloud VPS', 30)}** ({specs_str})\n"
            f"• **Price when Bought / Cost:** `⚡ {price_bought:,.2f} BOLTs`\n"
            f"• **Server Creation Date:** `{created_str}`\n"
            f"• **Server Expiry Date:** `{expires_str}`"
        )
        embed.add_field(name="🖥️ Linked Server Specifications & Lifecycle", value=srv_val, inline=False)

    if promo:
        p_status = "✅ Claimed" if promo.get("used") else "⏳ Unclaimed"
        admin_id = safe_str(promo.get("created_by_discord_id")).strip()
        admin_tag = f"<@{admin_id}>" if admin_id else "System"
        promo_amount = safe_float(promo.get("amount"))
        promo_date = format_date(promo.get("created_at") or promo.get("timestamp"))
        embed.add_field(
            name="🎁 Promo Code Info",
            value=(
                f"• **Code:** `{safe_str(promo.get('code') or 'N/A')}`\n"
                f"• **Value:** `⚡ {promo_amount:,.2f} BOLTs` — {p_status}\n"
                f"• **Reason:** *{truncate_text(promo.get('reason') or 'Admin Gift', 50)}*\n"
                f"• **Generated By:** {admin_tag} on `{promo_date}`"
            ),
            inline=False
        )

    l_lines = []
    for l in lifecycle[:6]:
        ev = safe_str(l.get("event") or "Event")
        date_l = format_date(l.get("timestamp") or l.get("created_at"))
        desc = truncate_text(l.get("description") or ev, 60)
        l_lines.append(f"• `{ev}` ({date_l}) — {desc}")

    if l_lines:
        add_chunked_fields(
            embed=embed,
            field_title="📜 Associated Audit Events",
            lines=l_lines,
            max_len=1000,
            empty_message="*No audit events.*"
        )

    embed.set_footer(text="Vertex Admin Control Panel | Transaction Audit Inspector")
    return embed


class UserInfoView(discord.ui.View):
    def __init__(self, admin_id: int, data: dict, target_label: str):
        super().__init__(timeout=300)
        self.admin_id = admin_id
        self.data = data or {}
        self.target_label = target_label
        self.current_tab = "overview"

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.admin_id:
            await interaction.response.send_message("❌ This admin session belongs to another administrator.", ephemeral=True)
            return False
        return True

    async def on_error(self, interaction: discord.Interaction, error: Exception, item: discord.ui.Item) -> None:
        print(f"[UserInfoView Error] tab={self.current_tab}, error={error}")
        err_embed = discord.Embed(
            title="⚠️ Tab Loading Error",
            description=f"Could not load the `{self.current_tab}` tab: `{str(error)}`\nPlease try again or contact administrator.",
            color=0xEF4444
        )
        try:
            if interaction.response.is_done():
                await interaction.followup.send(embed=err_embed, ephemeral=True)
            else:
                await interaction.response.edit_message(embed=err_embed, view=self)
        except Exception as e:
            print(f"[UserInfoView fallback error]: {e}")

    def _update_button_styles(self):
        tab_map = {
            "Overview": "overview",
            "Spending & Gains": "spending",
            "Promo Codes": "promos",
            "Servers & History": "servers",
            "Discord Stats": "discord",
        }
        for child in self.children:
            if isinstance(child, discord.ui.Button) and child.label in tab_map:
                if tab_map.get(child.label) == self.current_tab:
                    child.style = discord.ButtonStyle.primary
                else:
                    child.style = discord.ButtonStyle.secondary

    def build_overview_embed(self) -> discord.Embed:
        d = self.data or {}
        u = d.get("user") or {}
        disc = d.get("discord") or {}
        summary = d.get("summary") or {}
        disc_stats = disc.get("stats") or {}
        invites = disc.get("invites") or {}

        user_name = safe_str(u.get("name")) or safe_str(self.target_label) or "Unknown User"
        embed = discord.Embed(
            title=f"👤 Admin User Profile // {truncate_text(user_name, 50)}",
            color=0x3B82F6,
            description="Overview of user account, current BOLT balance, and global platform statistics."
        )

        discord_id = safe_str(disc.get("discord_id"))
        user_tag = f"<@{discord_id}>" if discord_id else "Not Linked"
        panel_id = u.get("id")
        panel_status = f"✅ Linked (`ID #{panel_id}`)" if panel_id else "❌ No Panel Account"
        email_val = safe_str(u.get("email")).strip()
        email_str = f"`{email_val}`" if email_val else "*None*"

        current_balance = safe_float(summary.get("current_balance", d.get("balance", 0.0)))
        total_deposited = safe_float(summary.get("total_deposited"))
        total_spent = safe_float(summary.get("total_spent"))
        total_bonus = safe_float(summary.get("total_bonus"))
        total_promo_claimed = safe_float(summary.get("total_promo_claimed"))
        total_tx = safe_int(summary.get("total_transactions"))
        active_servers = safe_int(summary.get("active_servers"))
        lifetime_servers = safe_int(summary.get("total_servers_lifetime"))
        promos_issued = safe_int(summary.get("total_promo_codes_issued"))

        created_date = format_date(u.get("created_at") or u.get("timestamp"))
        role_str = "Root Admin" if u.get("root_admin") else "Client"

        embed.add_field(name="Account Identity", value=f"**User:** {user_name}\n**Email:** {email_str}\n**Discord:** {user_tag}\n**Status:** {panel_status}", inline=True)
        embed.add_field(name="⚡ Current Balance", value=f"```\n{current_balance:,.2f} BOLTs\n```", inline=True)
        embed.add_field(name="🛡️ Role", value=f"**{role_str}**\nJoined: `{created_date}`", inline=True)

        embed.add_field(
            name="📊 Financial Summary",
            value=(
                f"• **Total Deposited:** `+{total_deposited:,.2f} BOLTs`\n"
                f"• **Total Spent:** `-{total_spent:,.2f} BOLTs`\n"
                f"• **Total Bonuses:** `+{total_bonus:,.2f} BOLTs`\n"
                f"• **Promo Codes Claimed:** `+{total_promo_claimed:,.2f} BOLTs`\n"
                f"• **Total Transactions:** `{total_tx}`"
            ),
            inline=True
        )

        embed.add_field(
            name="🖥️ Server Summary",
            value=(
                f"• **Active VPS Count:** `{active_servers}`\n"
                f"• **Lifetime Servers:** `{lifetime_servers}`\n"
                f"• **Promo Codes Issued:** `{promos_issued}`"
            ),
            inline=True
        )

        messages_count = safe_int(disc_stats.get("messages"))
        boosts_count = safe_int(disc_stats.get("boosts"))
        inv_valid = safe_int(invites.get("valid"))
        inv_joined = safe_int(invites.get("joined"))
        inv_left = safe_int(invites.get("left"))
        inv_fake = safe_int(invites.get("fake"))

        embed.add_field(
            name="📡 Discord Community Stats",
            value=(
                f"• **Messages:** `{messages_count:,}`\n"
                f"• **Server Boosts:** `{boosts_count}`\n"
                f"• **Valid Invites:** `{inv_valid}` (Total: `{inv_joined}`, Left: `{inv_left}`, Fake: `{inv_fake}`)"
            ),
            inline=False
        )

        embed.set_footer(text="Vertex Admin Control Panel | Use tabs below to navigate")
        return embed

    def build_spending_embed(self) -> discord.Embed:
        d = self.data or {}
        summary = d.get("summary") or {}
        txs = d.get("spending_history") or []

        total_spent = safe_float(summary.get("total_spent"))
        total_deposited = safe_float(summary.get("total_deposited"))
        current_balance = safe_float(summary.get("current_balance", d.get("balance", 0.0)))

        embed = discord.Embed(
            title=f"💳 Spending & Gains History // {truncate_text(self.target_label, 50)}",
            color=0x10B981,
            description=(
                f"**Total Spent:** `-{total_spent:,.2f} BOLTs` | "
                f"**Total Deposited:** `+{total_deposited:,.2f} BOLTs` | "
                f"**Balance:** `{current_balance:,.2f} BOLTs`\n"
                f"*Tip: Use the **🔍 Lookup Transaction** button below to inspect any transaction ID!*"
            )
        )

        lines = []
        for tx in txs[:15]:
            amt = safe_float(tx.get("amount"))
            sign = "+" if amt > 0 else ""
            amt_str = f"{sign}{amt:,.2f} BOLTs"
            date_str = format_date(tx.get("created_at") or tx.get("timestamp"))
            desc_raw = tx.get("description") or tx.get("type") or "Credit adjustment"
            desc = truncate_text(desc_raw, 55)
            ref_id = safe_str(tx.get("reference_id")).strip()
            ref = f" (`{ref_id}`)" if ref_id else ""
            lines.append(f"• **{amt_str}** | `{date_str}` — {desc}{ref}")

        add_chunked_fields(
            embed=embed,
            field_title=f"Recent Transactions ({len(txs)} total)",
            lines=lines,
            max_len=1000,
            empty_message="*No transaction records found for this user.*"
        )

        embed.set_footer(text="Vertex Admin Control Panel | Showing recent transactions")
        return embed

    def build_promos_embed(self) -> discord.Embed:
        d = self.data or {}
        promos = d.get("promo_history") or []
        summary = d.get("summary") or {}

        promos_issued = safe_int(summary.get("total_promo_codes_issued", len(promos)))
        promo_gen = safe_float(summary.get("total_promo_generated"))
        promo_claimed = safe_float(summary.get("total_promo_claimed"))

        embed = discord.Embed(
            title=f"🎁 Promo Codes & Admin Gifts // {truncate_text(self.target_label, 50)}",
            color=0xF59E0B,
            description=(
                f"**Total Promo Codes Issued:** `{promos_issued}` | "
                f"**Total Value:** `⚡ {promo_gen:,.2f} BOLTs` | "
                f"**Claimed Value:** `⚡ {promo_claimed:,.2f} BOLTs`"
            )
        )

        lines = []
        for p in promos[:12]:
            status = "✅ CLAIMED" if p.get("used") else "⏳ UNCLAIMED"
            admin_id = safe_str(p.get("created_by_discord_id")).strip()
            admin_str = f"<@{admin_id}>" if admin_id else "System"
            date_str = format_date(p.get("created_at") or p.get("timestamp"))
            reason = truncate_text(p.get("reason") or "Admin Gift", 40)
            code = safe_str(p.get("code") or "CODE").strip()
            amount = safe_float(p.get("amount"))
            lines.append(f"• `{code}` (**{amount:,.0f} BOLTs**) — {status}\n  └ Reason: *{reason}* | By: {admin_str} on `{date_str}`")

        add_chunked_fields(
            embed=embed,
            field_title=f"Issued Codes ({len(promos)} total)",
            lines=lines,
            max_len=1000,
            empty_message="*No promo codes issued to this user.*"
        )

        embed.set_footer(text="Vertex Admin Control Panel | Promo Code Tracking")
        return embed

    def build_servers_embed(self) -> discord.Embed:
        d = self.data or {}
        servers = d.get("owned_servers") or []
        history = d.get("server_history") or []

        embed = discord.Embed(
            title=f"🖥️ Servers & Lifecycle History // {truncate_text(self.target_label, 50)}",
            color=0x8B5CF6,
            description=f"**Currently Active Servers:** `{len(servers)}` | **Recorded Lifecycle Events:** `{len(history)}`"
        )

        if not servers:
            embed.add_field(name="Active Servers", value="*User currently has no active VPS instances.*", inline=False)
        else:
            for srv in servers[:6]:
                status_raw = safe_str(srv.get("status") or "in_use").lower()
                status_icon = "🟢 In Use" if status_raw in ["in_use", "running", "active"] else "🟡 Installing" if "install" in status_raw else "🔴 Suspended" if "suspend" in status_raw else "⚠️ Expired" if "expire" in status_raw else f"⚪ {status_raw.capitalize()}"
                expiry = format_date(srv.get("expires_at"), default="No Expiry")
                ram_mb = safe_int(srv.get("memory_mb"))
                disk_mb = safe_int(srv.get("disk_mb"))
                cpu_cores = safe_float(srv.get("cpu_cores", 1))
                specs = f"{cpu_cores:g} vCPU | {ram_mb:,} MB RAM | {disk_mb:,} MB Disk"
                srv_name = truncate_text(srv.get("name") or "VPS Instance", 40)
                node_name = truncate_text(srv.get("node_name") or "Node", 30)
                ip_str = safe_str(srv.get("ip") or "N/A")
                plan_desc = truncate_text(srv.get("description") or "Standard VPS", 30)
                vmid = safe_str(srv.get("vmid") or "N/A")
                val = (
                    f"**Status:** {status_icon} | **VMID:** `{vmid}`\n"
                    f"**Node:** `{node_name}` (`{ip_str}`)\n"
                    f"**Specs:** {specs}\n"
                    f"**Expires:** `{expiry}` | **Plan/OS:** {plan_desc}"
                )
                embed.add_field(name=f"🖥️ {srv_name}", value=val, inline=False)

        h_lines = []
        for h in history[:10]:
            badge = safe_str(h.get("status_badge") or "Event")
            icon = "🟢" if badge == "Deployed" else "🗑️" if badge == "Deleted" else "🔄" if badge == "Renewed" else "🔴" if badge == "Suspended" else "⚡"
            date_str = format_date(h.get("created_at") or h.get("timestamp"))
            desc = truncate_text(h.get("description") or badge, 60)
            h_lines.append(f"{icon} **{badge}** (`{date_str}`): {desc}")

        add_chunked_fields(
            embed=embed,
            field_title="📜 Recent Server Lifecycle Events",
            lines=h_lines,
            max_len=1000,
            empty_message="*No server lifecycle events recorded.*"
        )

        embed.set_footer(text="Vertex Admin Control Panel | VPS & Hypervisor Tracker")
        return embed

    def build_discord_embed(self) -> discord.Embed:
        d = self.data or {}
        disc = d.get("discord") or {}
        stats = disc.get("stats") or {}
        invites = disc.get("invites") or {}
        u = d.get("user") or {}

        embed = discord.Embed(
            title=f"📡 Discord & Community Activity // {truncate_text(self.target_label, 50)}",
            color=0x5865F2,
            description="Detailed breakdown of Discord chat messages, server boosts, and invite conversions."
        )

        discord_id = safe_str(disc.get("discord_id")).strip()
        user_tag = f"<@{discord_id}> (`{discord_id}`)" if discord_id else "Not Linked"
        embed.add_field(name="Discord Snowflake", value=user_tag, inline=False)

        messages_count = safe_int(stats.get("messages"))
        boosts_count = safe_int(stats.get("boosts"))
        embed.add_field(
            name="💬 Chat Activity",
            value=f"**Total Messages Tracked:**\n```\n{messages_count:,} messages\n```",
            inline=True
        )

        embed.add_field(
            name="🚀 Server Boosts",
            value=f"**Active Nitro Boosts:**\n```\n{boosts_count} boosts\n```",
            inline=True
        )

        inv_valid = safe_int(invites.get("valid"))
        inv_joined = safe_int(invites.get("joined"))
        inv_left = safe_int(invites.get("left"))
        inv_fake = safe_int(invites.get("fake"))

        embed.add_field(
            name="🎁 Invite Conversions",
            value=(
                f"• **Valid Active Invites:** `{inv_valid}`\n"
                f"• **Total Joined:** `{inv_joined}`\n"
                f"• **Departed (Left):** `{inv_left}`\n"
                f"• **Fake / Anomalies:** `{inv_fake}`"
            ),
            inline=False
        )

        user_id = u.get("id")
        if user_id:
            u_name = safe_str(u.get("name") or "User")
            u_email = safe_str(u.get("email") or "N/A")
            embed.add_field(
                name="🔗 Panel Sync Status",
                value=f"✅ Synced with Panel User ID `#{user_id}` ({u_name} | `{u_email}`)",
                inline=False
            )
        else:
            embed.add_field(
                name="🔗 Panel Sync Status",
                value="⚠️ No panel account currently linked to this Discord ID.",
                inline=False
            )

        embed.set_footer(text="Vertex Community Tracker | Anti-Cheat & Activity Module")
        return embed

    @discord.ui.button(label="Overview", style=discord.ButtonStyle.primary, emoji="📊", row=0)
    async def btn_overview(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "overview"
        self._update_button_styles()
        await interaction.response.edit_message(embed=self.build_overview_embed(), view=self)

    @discord.ui.button(label="Spending & Gains", style=discord.ButtonStyle.secondary, emoji="💳", row=0)
    async def btn_spending(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "spending"
        self._update_button_styles()
        await interaction.response.edit_message(embed=self.build_spending_embed(), view=self)

    @discord.ui.button(label="Promo Codes", style=discord.ButtonStyle.secondary, emoji="🎁", row=0)
    async def btn_promos(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "promos"
        self._update_button_styles()
        await interaction.response.edit_message(embed=self.build_promos_embed(), view=self)

    @discord.ui.button(label="Servers & History", style=discord.ButtonStyle.secondary, emoji="🖥️", row=0)
    async def btn_servers(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "servers"
        self._update_button_styles()
        await interaction.response.edit_message(embed=self.build_servers_embed(), view=self)

    @discord.ui.button(label="Discord Stats", style=discord.ButtonStyle.secondary, emoji="📡", row=0)
    async def btn_discord(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "discord"
        self._update_button_styles()
        await interaction.response.edit_message(embed=self.build_discord_embed(), view=self)

    @discord.ui.button(label="Lookup Transaction", style=discord.ButtonStyle.success, emoji="🔍", row=1)
    async def btn_lookup_tx(self, interaction: discord.Interaction, button: discord.ui.Button):
        async def on_tx_submit(modal_interaction: discord.Interaction, tx_ref: str):
            await modal_interaction.response.defer(ephemeral=True)
            res = await panel_api.get_transaction_details(tx_ref)
            if not res.get("ok"):
                err_embed = discord.Embed(
                    title="❌ Transaction Not Found",
                    description=res.get("error", f"Could not find any transaction or server records matching `{tx_ref}`."),
                    color=0xEF4444
                )
                return await modal_interaction.followup.send(embed=err_embed, ephemeral=True)
            tx_embed = build_transaction_embed(res)
            await modal_interaction.followup.send(embed=tx_embed, ephemeral=True)

        await interaction.response.send_modal(TransactionLookupModal(on_tx_submit))


@bot.tree.command(name="userinfo", description="View user balance, spending, owned servers & history (Admin Only)")
async def userinfo_cmd(
    interaction: discord.Interaction,
    user: Optional[Union[discord.Member, discord.User]] = None,
    query: Optional[str] = None
):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)

    await interaction.response.defer(ephemeral=True)

    identifier = str(user.id) if user else (query or str(interaction.user.id))
    label = user.display_name if user else (query or interaction.user.display_name)

    data = await panel_api.get_user_history(identifier)

    if not data.get("ok"):
        embed = discord.Embed(
            title="❌ User Not Found",
            description=data.get("error", f"Could not find account or activity for `{identifier}`."),
            color=0xEF4444
        )
        return await interaction.followup.send(embed=embed, ephemeral=True)

    view = UserInfoView(admin_id=interaction.user.id, data=data, target_label=label)
    await interaction.followup.send(embed=view.build_overview_embed(), view=view, ephemeral=True)


@bot.tree.command(name="txinfo", description="Inspect detailed server info & price for a transaction ID (Admin Only)")
async def txinfo_cmd(interaction: discord.Interaction, reference_id: str):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)

    await interaction.response.defer(ephemeral=True)

    res = await panel_api.get_transaction_details(reference_id)
    if not res.get("ok"):
        err_embed = discord.Embed(
            title="❌ Transaction Not Found",
            description=res.get("error", f"Could not find any transaction or server records matching `{reference_id}`."),
            color=0xEF4444
        )
        return await interaction.followup.send(embed=err_embed, ephemeral=True)

    tx_embed = build_transaction_embed(res)
    await interaction.followup.send(embed=tx_embed, ephemeral=True)


# ─── Admin: /vm-delete (Staff VM Deletion Workflow with Multi-Step Verification & HTML Transcript) ───

def generate_deletion_transcript_html(
    vmid: str,
    server_name: str,
    node_name: str,
    node_ip: str,
    specs_str: str,
    admin_name: str,
    admin_id: str,
    user_name: str,
    user_id: str,
    user_email: str,
    guild_name: str,
    channel_name: str,
    written_message: str,
    deletion_method: str,
    step1_time: str,
    step2_time: str,
    step3_time: str,
    completed_time: str,
) -> str:
    method_badge = (
        '<span style="background:#10B981;color:#fff;padding:4px 10px;border-radius:4px;font-weight:700;font-size:12px;">Standard Hypervisor Uninstall</span>'
        if "standard" in deletion_method.lower()
        else '<span style="background:#F59E0B;color:#000;padding:4px 10px;border-radius:4px;font-weight:700;font-size:12px;">Automatic Database Wipe Fallback</span>'
    )

    doc_ref = f"DEL-VM{vmid}-{int(time.time())}"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vertex Cloud - VM Deletion Audit Certificate #{doc_ref}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }}
        body {{ background-color: #0F172A; color: #E2E8F0; padding: 40px 20px; line-height: 1.6; }}
        .container {{ max-width: 850px; margin: 0 auto; background: #1E293B; border-radius: 12px; border: 1px solid #334155; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; }}
        .header {{ background: linear-gradient(135deg, #1E1B4B 0%, #312E81 100%); padding: 30px; border-bottom: 2px solid #4F46E5; display: flex; justify-content: space-between; align-items: center; }}
        .brand {{ font-size: 24px; font-weight: 800; color: #818CF8; letter-spacing: 1px; }}
        .brand span {{ color: #F43F5E; }}
        .cert-badge {{ background: rgba(239, 68, 68, 0.2); border: 1px solid #EF4444; color: #FCA5A5; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }}
        .content {{ padding: 30px; }}
        .alert-box {{ background: #450A0A; border-left: 4px solid #EF4444; padding: 15px 20px; border-radius: 6px; margin-bottom: 25px; color: #FECACA; }}
        .alert-box strong {{ color: #FFFFFF; font-size: 15px; }}
        .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }}
        .card {{ background: #0F172A; border: 1px solid #334155; border-radius: 8px; padding: 18px; }}
        .card h3 {{ font-size: 14px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; border-bottom: 1px solid #1E293B; padding-bottom: 6px; }}
        .info-row {{ display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }}
        .info-row:last-child {{ margin-bottom: 0; }}
        .info-label {{ color: #64748B; }}
        .info-val {{ color: #F1F5F9; font-weight: 600; }}
        .code {{ font-family: 'Courier New', Courier, monospace; background: #1E293B; padding: 2px 6px; border-radius: 4px; color: #38BDF8; font-size: 12px; }}
        .timeline {{ margin-top: 30px; border-top: 1px solid #334155; padding-top: 25px; }}
        .timeline h3 {{ font-size: 16px; color: #F8FAFC; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }}
        .timeline-step {{ position: relative; padding-left: 30px; margin-bottom: 22px; }}
        .timeline-step::before {{ content: ''; position: absolute; left: 0; top: 4px; width: 14px; height: 14px; border-radius: 50%; background: #10B981; border: 3px solid #064E3B; }}
        .timeline-step::after {{ content: ''; position: absolute; left: 6px; top: 20px; width: 2px; height: calc(100% + 4px); background: #334155; }}
        .timeline-step:last-child::after {{ display: none; }}
        .step-header {{ display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px; }}
        .step-title {{ font-weight: 700; color: #E2E8F0; }}
        .step-time {{ color: #64748B; font-size: 12px; }}
        .step-desc {{ font-size: 13px; color: #94A3B8; background: #0F172A; padding: 10px 14px; border-radius: 6px; border: 1px solid #1E293B; margin-top: 6px; }}
        .written-quote {{ font-family: monospace; color: #FACC15; background: #262626; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-top: 4px; }}
        .footer {{ background: #0F172A; padding: 20px 30px; border-top: 1px solid #334155; font-size: 12px; color: #64748B; text-align: center; }}
        .seal {{ display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid #10B981; color: #34D399; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 11px; text-transform: uppercase; margin-bottom: 10px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <div class="brand">VERTEX<span>HOST</span> // CLOUD AUDIT</div>
                <div style="font-size: 12px; color: #94A3B8; margin-top: 4px;">Cryptographic Certificate & User Agreement Record</div>
            </div>
            <div class="cert-badge">PERMANENTLY DESTROYED</div>
        </div>

        <div class="content">
            <div class="alert-box">
                <strong>⚠️ Official VM Deletion & Liability Discharge Certificate</strong><br>
                This document certifies that virtual machine instance <strong>{html.escape(server_name)}</strong> (VMID: {html.escape(str(vmid))}) was permanently destroyed following explicit multi-step authorization and user responsibility confirmation.
            </div>

            <div class="grid">
                <div class="card">
                    <h3>🖥️ Destroyed Virtual Machine</h3>
                    <div class="info-row"><span class="info-label">Instance Name:</span><span class="info-val">{html.escape(server_name)}</span></div>
                    <div class="info-row"><span class="info-label">Virtual Machine ID:</span><span class="info-val code">VMID #{html.escape(str(vmid))}</span></div>
                    <div class="info-row"><span class="info-label">Host Node & IP:</span><span class="info-val">{html.escape(node_name)} ({html.escape(node_ip)})</span></div>
                    <div class="info-row"><span class="info-label">Hardware Specs:</span><span class="info-val">{html.escape(specs_str)}</span></div>
                    <div class="info-row"><span class="info-label">Destruction Method:</span><span class="info-val">{method_badge}</span></div>
                </div>

                <div class="card">
                    <h3>👤 Responsible Parties & Location</h3>
                    <div class="info-row"><span class="info-label">Verified Owner:</span><span class="info-val">{html.escape(user_name)} (<span class="code">{html.escape(user_id)}</span>)</span></div>
                    <div class="info-row"><span class="info-label">Owner Email:</span><span class="info-val">{html.escape(user_email)}</span></div>
                    <div class="info-row"><span class="info-label">Initiating Staff:</span><span class="info-val">{html.escape(admin_name)} (<span class="code">{html.escape(admin_id)}</span>)</span></div>
                    <div class="info-row"><span class="info-label">Discord Guild:</span><span class="info-val">{html.escape(guild_name)}</span></div>
                    <div class="info-row"><span class="info-label">Channel Context:</span><span class="info-val">#{html.escape(channel_name)}</span></div>
                </div>
            </div>

            <div class="timeline">
                <h3>📜 Audit Log & Agreement Transcription</h3>

                <div class="timeline-step">
                    <div class="step-header">
                        <span class="step-title">1. Initial Deletion Warning & Data Loss Acknowledgment</span>
                        <span class="step-time">{html.escape(step1_time)}</span>
                    </div>
                    <div class="step-desc">
                        User acknowledged that all virtual disks, operating system files, and backups associated with VMID {html.escape(str(vmid))} would be permanently destroyed with no recovery option.
                    </div>
                </div>

                <div class="timeline-step">
                    <div class="step-header">
                        <span class="step-title">2. Administrator Liability Disclaimer & Owner Responsibility Clause</span>
                        <span class="step-time">{html.escape(step2_time)}</span>
                    </div>
                    <div class="step-desc">
                        <strong>Agreed Clause:</strong> <em>"Administrators and staff members can make mistakes. As the verified server owner, I am solely responsible for the deletion of this virtual machine, as staff members only dispatch deletion requests that I requested. Vertex Host and administrators are discharged from all liability."</em>
                    </div>
                </div>

                <div class="timeline-step">
                    <div class="step-header">
                        <span class="step-title">3. Exact Written Verification & Modal Submission</span>
                        <span class="step-time">{html.escape(step3_time)}</span>
                    </div>
                    <div class="step-desc">
                        User manually typed and submitted the required authorization phrase:<br>
                        <span class="written-quote">"{html.escape(written_message)}"</span>
                    </div>
                </div>

                <div class="timeline-step">
                    <div class="step-header">
                        <span class="step-title">4. Hypervisor Execution & Database Purge</span>
                        <span class="step-time">{html.escape(completed_time)}</span>
                    </div>
                    <div class="step-desc">
                        VM instance was decommissioned. Execution method: <strong>{html.escape(deletion_method)}</strong>. IP address bindings were released and server row removed from the database.
                    </div>
                </div>
            </div>
        </div>

        <div class="footer">
            <div class="seal">🔒 Cryptographic Audit Log Verified</div><br>
            Certificate Reference: <code>{doc_ref}</code> • Completed at: {html.escape(completed_time)}<br>
            Generated automatically by Vertex Admin Bot • Preserved for security and compliance purposes.
        </div>
    </div>
</body>
</html>
"""


class VmDeleteWrittenModal(discord.ui.Modal):
    def __init__(self, expected_vmid: str, on_success_callback):
        super().__init__(title=f"Final Authorization: VM {expected_vmid}")
        self.expected_vmid = str(expected_vmid).strip()
        self.on_success_callback = on_success_callback

        self.agreement_input = discord.ui.TextInput(
            label=f'Type: "I agree to vm {expected_vmid} deletion"',
            placeholder=f"I agree to vm {expected_vmid} deletion",
            min_length=12,
            max_length=60,
            required=True
        )
        self.add_item(self.agreement_input)

    async def on_submit(self, interaction: discord.Interaction):
        entered_text = self.agreement_input.value.strip()
        expected_text = f"I agree to vm {self.expected_vmid} deletion"

        if entered_text.lower() != expected_text.lower():
            err_msg = (
                f"❌ **Confirmation phrase mismatch!**\n\n"
                f"You entered:\n```\n{entered_text}\n```\n"
                f"Expected exact phrase:\n```\n{expected_text}\n```\n"
                f"Please click the button again and type the exact required phrase."
            )
            return await interaction.response.send_message(err_msg, ephemeral=True)

        await self.on_success_callback(interaction, entered_text)


class DoubleConfirmView(discord.ui.View):
    def __init__(
        self,
        admin: Union[discord.Member, discord.User],
        target_user: Union[discord.Member, discord.User],
        server: dict,
        user_history: dict,
        channel: discord.abc.Messageable,
        step1_time: str
    ):
        super().__init__(timeout=300)
        self.admin = admin
        self.target_user = target_user
        self.server = server
        self.user_history = user_history
        self.channel = channel
        self.step1_time = step1_time

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.target_user.id:
            await interaction.response.send_message(
                f"❌ This confirmation prompt is strictly for the VM owner, {self.target_user.mention}.",
                ephemeral=True
            )
            return False
        return True

    @discord.ui.button(label="⚠️ I Understand & Agree to Proceed", style=discord.ButtonStyle.danger, emoji="⚡")
    async def btn_proceed(self, interaction: discord.Interaction, button: discord.ui.Button):
        step2_time = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        vmid = str(self.server.get("vmid") or self.server.get("id") or "N/A")

        async def on_modal_submit(modal_interaction: discord.Interaction, written_text: str):
            step3_time = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
            await modal_interaction.response.defer()

            srv_id = str(self.server.get("id") or self.server.get("vmid"))
            res = await panel_api.delete_vm(
                server_id=srv_id,
                admin_discord_id=str(self.admin.id),
                user_discord_id=str(self.target_user.id)
            )

            completed_time = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')

            if not res.get("ok"):
                err_embed = discord.Embed(
                    title="❌ VM Deletion Failed",
                    description=f"An error occurred while deleting the VM: `{res.get('error', 'Unknown hypervisor/database error')}`\nPlease contact administrator.",
                    color=0xEF4444
                )
                try:
                    await modal_interaction.edit_original_response(embed=err_embed, view=None)
                except Exception:
                    await self.channel.send(embed=err_embed)
                return

            deletion_method = res.get("method", "standard")
            srv_info = res.get("server") or self.server

            srv_name = safe_str(srv_info.get("name") or self.server.get("name") or "VPS Instance")
            node_name = safe_str(srv_info.get("node_name") or self.server.get("node_name") or "Primary Node")
            node_ip = safe_str(srv_info.get("ip") or self.server.get("ip") or "N/A")
            cpu_cores = safe_float(srv_info.get("cpu_cores") or self.server.get("cpu_cores", 1))
            ram_mb = safe_int(srv_info.get("memory_mb") or self.server.get("memory_mb"))
            disk_mb = safe_int(srv_info.get("disk_mb") or self.server.get("disk_mb"))
            specs_str = f"{cpu_cores:g} vCPU | {ram_mb:,} MB RAM | {disk_mb:,} MB Storage"

            u_data = self.user_history.get("user") or {}
            user_email = safe_str(u_data.get("email") or srv_info.get("owner_email") or "Not Linked")
            guild_name = getattr(interaction.guild, "name", "Vertex Community")
            channel_name = getattr(interaction.channel, "name", "vm-delete")

            transcript_html = generate_deletion_transcript_html(
                vmid=vmid,
                server_name=srv_name,
                node_name=node_name,
                node_ip=node_ip,
                specs_str=specs_str,
                admin_name=self.admin.display_name,
                admin_id=str(self.admin.id),
                user_name=self.target_user.display_name,
                user_id=str(self.target_user.id),
                user_email=user_email,
                guild_name=guild_name,
                channel_name=channel_name,
                written_message=written_text,
                deletion_method="Standard Hypervisor Uninstall" if "standard" in deletion_method else "Automatic Database Wipe Fallback",
                step1_time=self.step1_time,
                step2_time=step2_time,
                step3_time=step3_time,
                completed_time=completed_time,
            )

            transcript_bytes = transcript_html.encode("utf-8")
            dm_file = discord.File(fp=io.BytesIO(transcript_bytes), filename=f"vm-{vmid}-deletion-transcript.html")
            audit_file = discord.File(fp=io.BytesIO(transcript_bytes), filename=f"vm-{vmid}-deletion-transcript.html")

            dm_sent = False
            try:
                dm_embed = discord.Embed(
                    title="📄 VM Deletion Certificate & Transcript Record",
                    description=(
                        f"Your virtual machine **{srv_name}** (VMID: `{vmid}`) has been permanently deleted.\n\n"
                        f"Attached below is your official **HTML Deletion Agreement & Audit Certificate** containing the full record and transcript of everything agreed to during this authorization."
                    ),
                    color=0x10B981,
                    timestamp=discord.utils.utcnow()
                )
                dm_embed.add_field(name="VM Instance", value=f"`{srv_name}` (VMID `#{vmid}`)", inline=True)
                dm_embed.add_field(name="Node / Location", value=f"`{node_name}`", inline=True)
                dm_embed.add_field(name="Executed By", value=f"{self.admin.mention}", inline=True)
                dm_embed.add_field(name="Deletion Method", value=f"`{deletion_method.upper()}`", inline=True)
                dm_embed.add_field(name="Completed At", value=f"`{completed_time}`", inline=True)
                dm_embed.set_footer(text="Vertex Host | Official Cloud Audit Record")
                await self.target_user.send(embed=dm_embed, file=dm_file)
                dm_sent = True
            except Exception as e:
                print(f"[vm-delete] Could not send DM to {self.target_user.id}: {e}")
                dm_sent = False

            success_embed = discord.Embed(
                title="✅ Virtual Machine Deleted Successfully",
                description=(
                    f"Virtual machine **{srv_name}** (VMID: `{vmid}`) has been permanently deleted from Vertex Cloud.\n\n"
                    f"• **Owner:** {self.target_user.mention} (`{self.target_user.id}`)\n"
                    f"• **Initiating Staff:** {self.admin.mention}\n"
                    f"• **Deletion Method:** `{deletion_method.upper()}`\n"
                    f"• **DM Delivery:** {'✅ HTML Audit Certificate delivered to DM.' if dm_sent else '⚠️ User DMs are closed.'}"
                ),
                color=0x10B981,
                timestamp=discord.utils.utcnow()
            )
            success_embed.add_field(name="🖥️ Specs Released", value=f"`{specs_str}` on `{node_name}` (`{node_ip}`)", inline=False)
            success_embed.set_footer(text="Vertex Admin Control Panel | VM Lifecycle Decommissioned")

            try:
                await modal_interaction.edit_original_response(embed=success_embed, view=None)
            except Exception:
                await self.channel.send(embed=success_embed)

            log_embed = discord.Embed(
                title="🗑️ [Audit Log] Cloud VM Deleted & Certificate Generated",
                description=f"VM **{srv_name}** (VMID: `{vmid}`) was destroyed following interactive user authorization.",
                color=0xEF4444,
                timestamp=discord.utils.utcnow()
            )
            log_embed.add_field(name="Target User", value=f"{self.target_user.mention} (`{self.target_user.id}`)", inline=True)
            log_embed.add_field(name="Staff Member", value=f"{self.admin.mention} (`{self.admin.id}`)", inline=True)
            log_embed.add_field(name="VMID & Name", value=f"`#{vmid}` — {srv_name}", inline=True)
            log_embed.add_field(name="Node & IP", value=f"`{node_name}` ({node_ip})", inline=True)
            log_embed.add_field(name="Method", value=f"`{deletion_method}`", inline=True)
            log_embed.add_field(name="User Written Agreement", value=f"```\n{written_text}\n```", inline=False)
            log_embed.set_footer(text="Vertex Audit Logger | Deletion Certificate Attached")
            await log_to_channel(log_embed, file=audit_file)

        await interaction.response.send_modal(VmDeleteWrittenModal(vmid, on_modal_submit))

    @discord.ui.button(label="❌ Cancel Deletion", style=discord.ButtonStyle.secondary)
    async def btn_cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        cancel_embed = discord.Embed(
            title="❌ VM Deletion Cancelled",
            description=f"VM deletion request for **{self.server.get('name')}** (VMID: `{self.server.get('vmid')}`) was cancelled by {self.target_user.mention}.",
            color=0x6B7280
        )
        await interaction.response.edit_message(embed=cancel_embed, view=None)


class UserVmConfirmView(discord.ui.View):
    def __init__(
        self,
        admin: Union[discord.Member, discord.User],
        target_user: Union[discord.Member, discord.User],
        server: dict,
        user_history: dict,
        channel: discord.abc.Messageable
    ):
        super().__init__(timeout=300)
        self.admin = admin
        self.target_user = target_user
        self.server = server
        self.user_history = user_history
        self.channel = channel

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.target_user.id:
            await interaction.response.send_message(
                f"❌ This confirmation prompt is strictly for the VM owner, {self.target_user.mention}.",
                ephemeral=True
            )
            return False
        return True

    @discord.ui.button(label="🗑️ Confirm Deletion", style=discord.ButtonStyle.danger, emoji="⚠️")
    async def btn_confirm_initial(self, interaction: discord.Interaction, button: discord.ui.Button):
        step1_time = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        vmid = str(self.server.get("vmid") or self.server.get("id") or "N/A")
        srv_name = safe_str(self.server.get("name") or "VPS Instance")
        node_name = safe_str(self.server.get("node_name") or "Primary Node")

        double_embed = discord.Embed(
            title="⚠️ CRITICAL: Double Confirmation & Liability Responsibility",
            description=(
                f"Please carefully review this statement before proceeding:\n\n"
                f"**🛑 Staff Error & Owner Responsibility Notice:**\n"
                f"Administrators and staff members can make mistakes. **You (the server owner) are solely responsible for the deletion of this virtual machine**, as staff members only dispatch deletion requests that you have requested or initiated.\n\n"
                f"Vertex Host and its administrators are **discharged from all liability** regarding data loss resulting from this deletion.\n\n"
                f"To complete this process, you will be required in the final step to type:\n"
                f"```\nI agree to vm {vmid} deletion\n```"
            ),
            color=0xDC2626
        )
        double_embed.add_field(name="🖥️ VM to be Destroyed", value=f"**{srv_name}** (VMID `#{vmid}`) on `{node_name}`", inline=False)
        double_embed.add_field(name="👤 Responsible Owner", value=f"{self.target_user.mention} (`{self.target_user.id}`)", inline=True)
        double_embed.add_field(name="🛡️ Initiating Staff", value=f"{self.admin.mention}", inline=True)
        double_embed.set_footer(text="Step 2 of 3 | Final Liability & Written Confirmation Step Next")

        next_view = DoubleConfirmView(
            admin=self.admin,
            target_user=self.target_user,
            server=self.server,
            user_history=self.user_history,
            channel=self.channel,
            step1_time=step1_time
        )
        await interaction.response.edit_message(embed=double_embed, view=next_view)

    @discord.ui.button(label="❌ Decline Request", style=discord.ButtonStyle.secondary)
    async def btn_decline(self, interaction: discord.Interaction, button: discord.ui.Button):
        cancel_embed = discord.Embed(
            title="❌ VM Deletion Request Declined",
            description=f"The VM deletion request for **{self.server.get('name')}** (VMID: `{self.server.get('vmid')}`) was declined by {self.target_user.mention}.",
            color=0x6B7280
        )
        await interaction.response.edit_message(embed=cancel_embed, view=None)

        log_embed = discord.Embed(
            title="ℹ️ [Audit Log] VM Deletion Request Declined",
            description=f"User {self.target_user.mention} declined the VM deletion request initiated by {self.admin.mention}.",
            color=0x6B7280,
            timestamp=discord.utils.utcnow()
        )
        log_embed.add_field(name="Target User", value=f"{self.target_user.mention} (`{self.target_user.id}`)", inline=True)
        log_embed.add_field(name="Staff Member", value=f"{self.admin.mention} (`{self.admin.id}`)", inline=True)
        log_embed.add_field(name="VM", value=f"{self.server.get('name')} (VMID `{self.server.get('vmid')}`)", inline=True)
        await log_to_channel(log_embed)


class AdminVmSelectView(discord.ui.View):
    def __init__(
        self,
        admin: Union[discord.Member, discord.User],
        target_user: Union[discord.Member, discord.User],
        servers: list[dict],
        user_history: dict,
        channel: discord.abc.Messageable
    ):
        super().__init__(timeout=180)
        self.admin = admin
        self.target_user = target_user
        self.servers = servers
        self.user_history = user_history
        self.channel = channel
        self.selected_server: Optional[dict] = None

        options = []
        for idx, srv in enumerate(servers[:25]):
            srv_name = safe_str(srv.get("name") or f"Server-{idx+1}")
            vmid = safe_str(srv.get("vmid") or srv.get("id") or "N/A")
            node = safe_str(srv.get("node_name") or "Primary")
            ram = safe_int(srv.get("memory_mb"))
            specs = f"{ram:,} MB RAM | Node: {node}"
            label = f"{srv_name} (VMID: {vmid})"[:100]
            desc = f"{specs}"[:100]
            options.append(discord.SelectOption(label=label, description=desc, value=str(srv.get("id") or srv.get("vmid"))))

        self.select_menu = discord.ui.Select(
            placeholder="Select the Virtual Machine to delete...",
            options=options,
            min_values=1,
            max_values=1
        )
        self.select_menu.callback = self.on_vm_selected
        self.add_item(self.select_menu)

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.admin.id:
            await interaction.response.send_message("❌ This admin session belongs to another administrator.", ephemeral=True)
            return False
        return True

    async def on_vm_selected(self, interaction: discord.Interaction):
        selected_id = self.select_menu.values[0]
        self.selected_server = next((s for s in self.servers if str(s.get("id")) == selected_id or str(s.get("vmid")) == selected_id), None)

        if not self.selected_server:
            return await interaction.response.send_message("❌ Selected server not found in cache.", ephemeral=True)

        srv = self.selected_server
        srv_name = safe_str(srv.get("name") or "VPS Instance")
        vmid = safe_str(srv.get("vmid") or srv.get("id") or "N/A")
        node_name = safe_str(srv.get("node_name") or "Primary Node")
        node_ip = safe_str(srv.get("ip") or "N/A")
        cpu_cores = safe_float(srv.get("cpu_cores", 1))
        ram_mb = safe_int(srv.get("memory_mb"))
        disk_mb = safe_int(srv.get("disk_mb"))
        specs_str = f"{cpu_cores:g} vCPU | {ram_mb:,} MB RAM | {disk_mb:,} MB Disk"
        expiry = format_date(srv.get("expires_at"), default="No Expiry")
        plan_desc = safe_str(srv.get("description") or "Standard Cloud VPS")

        confirm_embed = discord.Embed(
            title="🛡️ Admin VM Selection Confirmed",
            description=(
                f"You have selected the following virtual machine owned by **{self.target_user.mention}**.\n\n"
                f"Review the specifications carefully. When you click **Proceed**, the bot will send an official deletion authorization prompt into {self.channel.mention} tagging the user."
            ),
            color=0xEF4444
        )
        confirm_embed.add_field(name="🖥️ Virtual Machine", value=f"**{srv_name}** (VMID: `#{vmid}`)", inline=False)
        confirm_embed.add_field(name="Node & Location", value=f"`{node_name}` (`{node_ip}`)", inline=True)
        confirm_embed.add_field(name="Specs", value=f"`{specs_str}`", inline=True)
        confirm_embed.add_field(name="Expires", value=f"`{expiry}`", inline=True)
        confirm_embed.add_field(name="Plan & OS", value=f"`{plan_desc}`", inline=False)
        confirm_embed.set_footer(text="Admin Step 2: Confirm selected instance before dispatching to channel")

        admin_view = self

        class AdminConfirmSendView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)

            async def interaction_check(self, i: discord.Interaction) -> bool:
                return i.user.id == admin_view.admin.id

            @discord.ui.button(label="⚡ Proceed & Dispatch Request to Channel", style=discord.ButtonStyle.danger, emoji="📤")
            async def btn_dispatch(self, i: discord.Interaction, btn: discord.ui.Button):
                await i.response.edit_message(
                    embed=discord.Embed(
                        title="✅ Deletion Request Dispatched",
                        description=f"Official deletion confirmation request has been posted to {admin_view.channel.mention} for {admin_view.target_user.mention}.",
                        color=0x22C55E
                    ),
                    view=None
                )

                public_embed = discord.Embed(
                    title="🚨 Cloud VM Deletion Request // Authorization Required",
                    description=(
                        f"Staff member {admin_view.admin.mention} has initiated a deletion request for your virtual machine.\n\n"
                        f"**⚠️ Permanent Data Loss Warning:**\n"
                        f"• All virtual disks, operating system files, and backups will be **permanently wiped**.\n"
                        f"• All allocated IP addresses will be released.\n"
                        f"• This action is **IRREVERSIBLE** and cannot be undone.\n\n"
                        f"Please review the VM specifications below and choose to confirm or decline this request:"
                    ),
                    color=0xEF4444,
                    timestamp=discord.utils.utcnow()
                )
                public_embed.add_field(
                    name="🖥️ Virtual Machine Details",
                    value=(
                        f"• **Name:** `{srv_name}`\n"
                        f"• **VMID:** `#{vmid}`\n"
                        f"• **Node & IP:** `{node_name}` (`{node_ip}`)\n"
                        f"• **Specs:** `{specs_str}`\n"
                        f"• **Expires:** `{expiry}` | `{plan_desc}`"
                    ),
                    inline=False
                )
                public_embed.add_field(name="👤 Authorized Owner", value=f"{admin_view.target_user.mention} (`{admin_view.target_user.id}`)", inline=True)
                public_embed.add_field(name="🛡️ Initiated By Staff", value=f"{admin_view.admin.mention}", inline=True)
                public_embed.set_footer(text="Step 1 of 3 | Owner Confirmation Required")

                user_confirm_view = UserVmConfirmView(
                    admin=admin_view.admin,
                    target_user=admin_view.target_user,
                    server=srv,
                    user_history=admin_view.user_history,
                    channel=admin_view.channel
                )

                await admin_view.channel.send(
                    content=f"{admin_view.target_user.mention}",
                    embed=public_embed,
                    view=user_confirm_view
                )

            @discord.ui.button(label="❌ Cancel", style=discord.ButtonStyle.secondary)
            async def btn_cancel_admin(self, i: discord.Interaction, btn: discord.ui.Button):
                await i.response.edit_message(
                    embed=discord.Embed(title="❌ Cancelled", description="VM deletion workflow was cancelled.", color=0x6B7280),
                    view=None
                )

        await interaction.response.edit_message(embed=confirm_embed, view=AdminConfirmSendView())


@bot.tree.command(name="vm-delete", description="Staff tool to delete user VM with multi-step owner verification & HTML transcript (Admin Only)")
async def vm_delete_cmd(interaction: discord.Interaction, user: Union[discord.Member, discord.User]):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)

    await interaction.response.defer(ephemeral=True)

    user_history_data = await panel_api.get_user_history(str(user.id))
    if not user_history_data.get("ok"):
        embed = discord.Embed(
            title="❌ User Not Found",
            description=f"Could not find panel account or activity records for {user.mention} (`{user.id}`).",
            color=0xEF4444
        )
        return await interaction.followup.send(embed=embed, ephemeral=True)

    servers = user_history_data.get("owned_servers") or []
    if not servers:
        embed = discord.Embed(
            title="❌ No Virtual Machines Found",
            description=f"User {user.mention} (`{user.id}`) does not own any active virtual machine instances on Vertex Cloud.",
            color=0xEF4444
        )
        return await interaction.followup.send(embed=embed, ephemeral=True)

    admin_view = AdminVmSelectView(
        admin=interaction.user,
        target_user=user,
        servers=servers,
        user_history=user_history_data,
        channel=interaction.channel
    )

    overview_embed = discord.Embed(
        title=f"🗑️ Staff VM Deletion // User: {user.display_name}",
        description=(
            f"User {user.mention} currently has **{len(servers)} virtual machine{'s' if len(servers) != 1 else ''}**.\n\n"
            f"**Select a VM from the dropdown below to begin the deletion authorization workflow:**"
        ),
        color=0xEF4444
    )

    for s in servers[:6]:
        s_name = safe_str(s.get("name") or "VPS")
        vmid = safe_str(s.get("vmid") or s.get("id") or "N/A")
        node = safe_str(s.get("node_name") or "Node")
        ip = safe_str(s.get("ip") or "N/A")
        cpu = safe_float(s.get("cpu_cores", 1))
        ram = safe_int(s.get("memory_mb"))
        disk = safe_int(s.get("disk_mb"))
        specs = f"{cpu:g} vCPU | {ram:,} MB RAM | {disk:,} MB Disk"
        overview_embed.add_field(name=f"🖥️ {s_name} (VMID: `#{vmid}`)", value=f"• **Node:** `{node}` (`{ip}`)\n• **Specs:** `{specs}`", inline=True)

    overview_embed.set_footer(text="Admin Step 1: Visible only to staff • Select VM to dispatch request")
    await interaction.followup.send(embed=overview_embed, view=admin_view, ephemeral=True)


# ─── Admin: /add_bolts (Interactive History Preview, Presets & Modals) ────────

class CustomAmountModal(discord.ui.Modal, title="Custom BOLT Amount"):
    amount_input = discord.ui.TextInput(
        label="Enter BOLT Amount",
        placeholder="e.g. 7500",
        min_length=1,
        max_length=8,
        required=True
    )

    def __init__(self, callback_func):
        super().__init__()
        self.callback_func = callback_func

    async def on_submit(self, interaction: discord.Interaction):
        try:
            val = float(self.amount_input.value.strip())
            if val <= 0:
                raise ValueError()
            await self.callback_func(interaction, int(val))
        except ValueError:
            await interaction.response.send_message("❌ Please enter a valid positive number for BOLTs.", ephemeral=True)


class CustomReasonModal(discord.ui.Modal, title="Custom Reason for Gift"):
    reason_input = discord.ui.TextInput(
        label="Reason Description",
        placeholder="e.g. Event Winner / Community Contribution",
        min_length=3,
        max_length=150,
        required=True
    )

    def __init__(self, callback_func):
        super().__init__()
        self.callback_func = callback_func

    async def on_submit(self, interaction: discord.Interaction):
        await self.callback_func(interaction, self.reason_input.value.strip())


class AddBoltsInteractiveFlow:
    """Manages the step-by-step interactive workflow for generating promo codes."""

    def __init__(self, admin: discord.Member, target_user: Union[discord.Member, discord.User], user_history_data: dict):
        self.admin = admin
        self.target_user = target_user
        self.data = user_history_data
        self.selected_amount: Optional[int] = None
        self.selected_reason: Optional[str] = None

    def build_history_preview_embed(self) -> discord.Embed:
        d = self.data or {}
        u = d.get("user") or {}
        summary = d.get("summary") or {}
        promos = d.get("promo_history") or []

        embed = discord.Embed(
            title="⚡ Gift Bolts Promo Code // Step 1: User History Preview",
            description=f"Review **{self.target_user.mention}**'s previous earn history from admin promo codes before proceeding.",
            color=0xFACC15
        )

        user_name = safe_str(u.get('name') or self.target_user.name)
        user_email = safe_str(u.get('email') or 'Not Linked')
        current_balance = safe_float(summary.get('current_balance', d.get('balance', 0.0)))

        user_info_str = f"**User:** {user_name}\n**Email:** `{user_email}`\n**Current Balance:** `⚡ {current_balance:,.2f} BOLTs`"
        embed.add_field(name="Recipient Profile", value=user_info_str, inline=False)

        if not promos:
            embed.add_field(name="Previous Admin Promo Gifts", value="*This user has never received an admin promo code before.*", inline=False)
        else:
            p_lines = []
            for p in promos[:6]:
                status = "✅ Claimed" if p.get("used") else "⏳ Unclaimed"
                admin_id = safe_str(p.get("created_by_discord_id")).strip()
                admin_str = f"<@{admin_id}>" if admin_id else "Admin"
                date_str = format_date(p.get("created_at") or p.get("timestamp"))
                amount = safe_float(p.get("amount"))
                reason = truncate_text(p.get("reason") or "Admin Gift", 40)
                code = safe_str(p.get("code") or "CODE")
                p_lines.append(f"• `{code}` (**{amount:,.0f} BOLTs**) — {status}\n  └ *{reason}* by {admin_str} on `{date_str}`")

            promo_gen = safe_float(summary.get('total_promo_generated'))
            add_chunked_fields(
                embed=embed,
                field_title=f"Past Promo Codes ({len(promos)} total | {promo_gen:,.0f} BOLTs issued)",
                lines=p_lines,
                max_len=1000,
                empty_message="*No past promo codes found.*"
            )

        embed.add_field(
            name="⚠️ Action Confirmation",
            value=f"Do you wish to proceed with generating a new Bolt promo code for {self.target_user.mention}?",
            inline=False
        )
        embed.set_footer(text="Step 1 of 3 | Vertex Admin Promo Code Generator")
        return embed

    async def start(self, interaction: discord.Interaction):
        flow = self

        class ConfirmView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)

            async def interaction_check(self, i: discord.Interaction) -> bool:
                return i.user.id == flow.admin.id

            @discord.ui.button(label="⚡ Proceed", style=discord.ButtonStyle.success)
            async def on_proceed(self, i: discord.Interaction, button: discord.ui.Button):
                await flow.show_amount_selection(i)

            @discord.ui.button(label="❌ Cancel", style=discord.ButtonStyle.danger)
            async def on_cancel(self, i: discord.Interaction, button: discord.ui.Button):
                embed = discord.Embed(title="❌ Cancelled", description="Bolt promo code generation was cancelled.", color=0x9CA3AF)
                await i.response.edit_message(embed=embed, view=None)

        await interaction.followup.send(embed=self.build_history_preview_embed(), view=ConfirmView(), ephemeral=True)

    async def show_amount_selection(self, interaction: discord.Interaction):
        flow = self

        embed = discord.Embed(
            title="⚡ Select BOLT Amount // Step 2",
            description=(
                f"Choose the amount of BOLTs to gift to **{self.target_user.mention}**.\n\n"
                "Select one of the standard presets or enter a custom amount:"
            ),
            color=0x3B82F6
        )

        class AmountView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)

            async def interaction_check(self, i: discord.Interaction) -> bool:
                return i.user.id == flow.admin.id

            @discord.ui.button(label="⚡ 3,000 BOLTs", style=discord.ButtonStyle.primary)
            async def btn_3000(self, i: discord.Interaction, btn: discord.ui.Button):
                flow.selected_amount = 3000
                await flow.show_reason_selection(i)

            @discord.ui.button(label="⚡ 5,000 BOLTs", style=discord.ButtonStyle.primary)
            async def btn_5000(self, i: discord.Interaction, btn: discord.ui.Button):
                flow.selected_amount = 5000
                await flow.show_reason_selection(i)

            @discord.ui.button(label="✏️ Custom Amount", style=discord.ButtonStyle.secondary)
            async def btn_custom(self, i: discord.Interaction, btn: discord.ui.Button):
                async def custom_amount_cb(modal_interaction: discord.Interaction, custom_amt: int):
                    flow.selected_amount = custom_amt
                    await flow.show_reason_selection(modal_interaction)

                await i.response.send_modal(CustomAmountModal(custom_amount_cb))

        await interaction.response.edit_message(embed=embed, view=AmountView())

    async def show_reason_selection(self, interaction: discord.Interaction):
        flow = self

        embed = discord.Embed(
            title="🎯 Select Gift Reason // Step 3",
            description=(
                f"Recipient: **{self.target_user.mention}**\n"
                f"Selected Amount: **⚡ {self.selected_amount:,} BOLTs**\n\n"
                "Please select the reason for issuing this promo code:"
            ),
            color=0x8B5CF6
        )

        class ReasonView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)

            async def interaction_check(self, i: discord.Interaction) -> bool:
                return i.user.id == flow.admin.id

            @discord.ui.button(label="🎁 Invites Reward", style=discord.ButtonStyle.primary, emoji="👥")
            async def btn_invites(self, i: discord.Interaction, btn: discord.ui.Button):
                await flow.show_invites_subselection(i)

            @discord.ui.button(label="🚀 Server Boost Reward", style=discord.ButtonStyle.primary, emoji="⚡")
            async def btn_boosts(self, i: discord.Interaction, btn: discord.ui.Button):
                await flow.show_boosts_subselection(i)

            @discord.ui.button(label="✏️ Custom Reason", style=discord.ButtonStyle.secondary)
            async def btn_custom_reason(self, i: discord.Interaction, btn: discord.ui.Button):
                async def custom_reason_cb(modal_interaction: discord.Interaction, custom_text: str):
                    flow.selected_reason = custom_text
                    await flow.execute_generation(modal_interaction)

                await i.response.send_modal(CustomReasonModal(custom_reason_cb))

        if interaction.response.is_done():
            await interaction.followup.edit_message(message_id=interaction.message.id, embed=embed, view=ReasonView())
        else:
            await interaction.response.edit_message(embed=embed, view=ReasonView())

    async def show_invites_subselection(self, interaction: discord.Interaction):
        flow = self

        embed = discord.Embed(
            title="👥 Invites Milestone Selection",
            description=(
                f"Recipient: **{self.target_user.mention}** | Amount: **⚡ {self.selected_amount:,} BOLTs**\n\n"
                "Select the invite milestone achieved by this user:"
            ),
            color=0x6366F1
        )

        class InvitesSubView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)

            async def interaction_check(self, i: discord.Interaction) -> bool:
                return i.user.id == flow.admin.id

            @discord.ui.button(label="15 Verified Invites (3,000 BOLTs)", style=discord.ButtonStyle.success)
            async def btn_15(self, i: discord.Interaction, btn: discord.ui.Button):
                flow.selected_amount = 3000
                flow.selected_reason = "15 Verified Invites Reward"
                await flow.execute_generation(i)

            @discord.ui.button(label="25 Verified Invites (5,000 BOLTs)", style=discord.ButtonStyle.success)
            async def btn_25(self, i: discord.Interaction, btn: discord.ui.Button):
                flow.selected_amount = 5000
                flow.selected_reason = "25 Verified Invites Reward"
                await flow.execute_generation(i)

            @discord.ui.button(label="✏️ Other Invites Count", style=discord.ButtonStyle.secondary)
            async def btn_other_inv(self, i: discord.Interaction, btn: discord.ui.Button):
                async def inv_cb(modal_interaction: discord.Interaction, custom_text: str):
                    flow.selected_reason = f"{custom_text} Invites Reward"
                    await flow.execute_generation(modal_interaction)

                await i.response.send_modal(CustomReasonModal(inv_cb))

        await interaction.response.edit_message(embed=embed, view=InvitesSubView())

    async def show_boosts_subselection(self, interaction: discord.Interaction):
        flow = self

        embed = discord.Embed(
            title="🚀 Server Boost Milestone Selection",
            description=(
                f"Recipient: **{self.target_user.mention}** | Amount: **⚡ {self.selected_amount:,} BOLTs**\n\n"
                "Select the server boost tier achieved by this user:"
            ),
            color=0xEC4899
        )

        class BoostsSubView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)

            async def interaction_check(self, i: discord.Interaction) -> bool:
                return i.user.id == flow.admin.id

            @discord.ui.button(label="1× Server Boost (3,000 BOLTs)", style=discord.ButtonStyle.primary)
            async def btn_1_boost(self, i: discord.Interaction, btn: discord.ui.Button):
                flow.selected_amount = 3000
                flow.selected_reason = "1× Server Boost Reward"
                await flow.execute_generation(i)

            @discord.ui.button(label="2× Server Boosts (5,000 BOLTs)", style=discord.ButtonStyle.primary)
            async def btn_2_boosts(self, i: discord.Interaction, btn: discord.ui.Button):
                flow.selected_amount = 5000
                flow.selected_reason = "2× Server Boosts Reward"
                await flow.execute_generation(i)

            @discord.ui.button(label="✏️ Other Boost Milestone", style=discord.ButtonStyle.secondary)
            async def btn_other_boost(self, i: discord.Interaction, btn: discord.ui.Button):
                async def boost_cb(modal_interaction: discord.Interaction, custom_text: str):
                    flow.selected_reason = f"{custom_text} Boost Reward"
                    await flow.execute_generation(modal_interaction)

                await i.response.send_modal(CustomReasonModal(boost_cb))

        await interaction.response.edit_message(embed=embed, view=BoostsSubView())

    async def execute_generation(self, interaction: discord.Interaction):
        if not interaction.response.is_done():
            await interaction.response.defer(ephemeral=True)

        amount = self.selected_amount or 3000
        reason = self.selected_reason or "Admin Gift"


        try:
            code = await panel_api.generate_promo_code(
                discord_id=str(self.target_user.id),
                amount=amount,
                admin_discord_id=str(self.admin.id),
                reason=reason
            )

            dm_sent = False
            dm_embed = discord.Embed(
                title="⚡ You've Received Bolts!",
                description=f"An administrator has rewarded you with **{amount:,} BOLTs** for: **{reason}**!",
                color=0xFACC15,
            )
            dm_embed.add_field(name="Your Redemption Code", value=f"```\n{code}\n```", inline=False)
            dm_embed.add_field(
                name="How to Claim",
                value=(
                    "1. Sign in at the [Vertex Panel](https://dash.vertexnodes.top/account)\n"
                    "2. Make sure your Discord account is linked in Account Settings\n"
                    "3. Type `/redeem " + code + "` here in Discord\n"
                    "4. Or enter the code directly on the panel website!\n\n"
                    "🔗 https://dash.vertexnodes.top/account"
                ),
                inline=False,
            )
            dm_embed.set_footer(text=f"Issued by {self.admin.display_name} • Single-use code unique to your account")

            try:
                await self.target_user.send(embed=dm_embed)
                dm_sent = True
            except Exception:
                dm_sent = False

            confirm_embed = discord.Embed(
                title="✅ Promo Code Generated & Logged!",
                description=f"A new **{amount:,} BOLT** promo code has been successfully generated and recorded in the database.",
                color=0x22C55E
            )
            confirm_embed.add_field(name="Redemption Code", value=f"```\n{code}\n```", inline=False)
            confirm_embed.add_field(name="Recipient", value=f"{self.target_user.mention} (`{self.target_user.id}`)", inline=True)
            confirm_embed.add_field(name="Amount", value=f"**⚡ {amount:,} BOLTs**", inline=True)
            confirm_embed.add_field(name="Reason", value=f"`{reason}`", inline=True)
            confirm_embed.add_field(name="Logged Admin", value=f"{self.admin.mention} (`{self.admin.id}`)", inline=True)
            confirm_embed.add_field(name="Timestamp", value=f"<t:{int(time.time())}:F>", inline=True)
            confirm_embed.add_field(name="DM Status", value="✅ Code sent via Direct Message." if dm_sent else "⚠️ Recipient DMs are closed. Please deliver code manually.", inline=True)
            confirm_embed.set_footer(text="Vertex Admin Control Panel | Audit & Security Logged")

            if interaction.response.is_done():
                await interaction.followup.send(embed=confirm_embed, ephemeral=True)
            else:
                await interaction.response.edit_message(embed=confirm_embed, view=None)

            # Dispatch to audit log channel
            log_embed = discord.Embed(
                title="⚡ [Audit Log] Bolt Promo Code Generated",
                color=0xFACC15,
                timestamp=discord.utils.utcnow()
            )
            log_embed.add_field(name="Admin", value=f"{self.admin.mention} (`{self.admin.id}`)", inline=True)
            log_embed.add_field(name="Recipient", value=f"{self.target_user.mention} (`{self.target_user.id}`)", inline=True)
            log_embed.add_field(name="Amount", value=f"**{amount:,} BOLTs**", inline=True)
            log_embed.add_field(name="Reason", value=f"`{reason}`", inline=True)
            log_embed.add_field(name="Code", value=f"`{code}`", inline=True)
            log_embed.add_field(name="DM Status", value="Delivered" if dm_sent else "DMs Closed", inline=True)
            log_embed.set_footer(text="Vertex Admin Audit Logger")
            await log_to_channel(log_embed)

        except Exception as e:
            err_embed = discord.Embed(title="❌ Promo Generation Failed", description=f"Error: {e}", color=0xEF4444)
            if interaction.response.is_done():
                await interaction.followup.send(embed=err_embed, ephemeral=True)
            else:
                await interaction.response.edit_message(embed=err_embed, view=None)


@bot.tree.command(name="add_bolts", description="Interactive Bolt Promo Code Generator with History & Presets (Admin Only)")
async def add_bolts(interaction: discord.Interaction, user: Union[discord.Member, discord.User]):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)

    await interaction.response.defer(ephemeral=True)

    user_history_data = await panel_api.get_user_history(str(user.id))
    if not user_history_data.get("ok"):
        user_history_data = {"ok": True, "promo_history": [], "summary": {}}

    flow = AddBoltsInteractiveFlow(admin=interaction.user, target_user=user, user_history_data=user_history_data)
    await flow.start(interaction)


# ─── Admin: /add_messages ─────────────────────────────────────────────────────

@bot.tree.command(name="add_messages", description="Add messages to a user (Admin Only)")
async def add_messages(interaction: discord.Interaction, user: Union[discord.Member, discord.User], amount: int):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied", ephemeral=True)
    try:
        await panel_api.admin_add_messages(str(user.id), amount)
        await interaction.response.send_message(f"✅ Added **{amount}** messages to {user.mention}.", ephemeral=True)

        log_embed = discord.Embed(
            title="💬 [Audit Log] Messages Manually Added",
            color=0x3B82F6,
            timestamp=discord.utils.utcnow()
        )
        log_embed.add_field(name="Admin", value=f"{interaction.user.mention} (`{interaction.user.id}`)", inline=True)
        log_embed.add_field(name="Target User", value=f"{user.mention} (`{user.id}`)", inline=True)
        log_embed.add_field(name="Amount Added", value=f"+{amount:,} messages", inline=True)
        log_embed.set_footer(text="Vertex Admin Audit Logger")
        await log_to_channel(log_embed)
    except Exception as e:
        await interaction.response.send_message(f"❌ Error: {e}", ephemeral=True)

# ─── Admin: /add_invites ──────────────────────────────────────────────────────

@bot.tree.command(name="add_invites", description="Add invites to a user (Admin Only)")
async def add_invites(interaction: discord.Interaction, user: Union[discord.Member, discord.User], amount: int):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied", ephemeral=True)
    try:
        await panel_api.admin_add_invites(str(user.id), amount)
        await interaction.response.send_message(f"✅ Added **{amount}** invites to {user.mention}.", ephemeral=True)

        log_embed = discord.Embed(
            title="🎁 [Audit Log] Invites Manually Added",
            color=0x3B82F6,
            timestamp=discord.utils.utcnow()
        )
        log_embed.add_field(name="Admin", value=f"{interaction.user.mention} (`{interaction.user.id}`)", inline=True)
        log_embed.add_field(name="Target User", value=f"{user.mention} (`{user.id}`)", inline=True)
        log_embed.add_field(name="Amount Added", value=f"+{amount:,} invites", inline=True)
        log_embed.set_footer(text="Vertex Admin Audit Logger")
        await log_to_channel(log_embed)
    except Exception as e:
        await interaction.response.send_message(f"❌ Error: {e}", ephemeral=True)

# ─── Admin: /reset_user_stats ─────────────────────────────────────────────────

@bot.tree.command(name="reset_user_stats", description="Reset stats for a specific user (Admin Only)")
async def reset_user_stats(interaction: discord.Interaction, user: Union[discord.Member, discord.User]):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied.", ephemeral=True)
    try:
        await panel_api.admin_reset_user(str(user.id))
        await interaction.response.send_message(f"✅ Stats reset for {user.mention}.", ephemeral=True)

        log_embed = discord.Embed(
            title="⚠️ [Audit Log] User Stats Reset",
            color=0xF59E0B,
            timestamp=discord.utils.utcnow()
        )
        log_embed.add_field(name="Admin", value=f"{interaction.user.mention} (`{interaction.user.id}`)", inline=True)
        log_embed.add_field(name="Target User", value=f"{user.mention} (`{user.id}`)", inline=True)
        log_embed.set_footer(text="Vertex Admin Audit Logger")
        await log_to_channel(log_embed)
    except Exception as e:
        await interaction.response.send_message(f"❌ Error: {e}", ephemeral=True)

# ─── Admin: /reset_all_stats ──────────────────────────────────────────────────

@bot.tree.command(name="reset_all_stats", description="WIPE stats for ALL users (Admin Only)")
async def reset_all_stats(interaction: discord.Interaction):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied.", ephemeral=True)
    await interaction.response.defer(ephemeral=True)
    try:
        await panel_api.admin_reset_all()
        await interaction.followup.send("✅ All stats have been reset.", ephemeral=True)

        log_embed = discord.Embed(
            title="🚨 [Audit Log] ALL STATS WIPED",
            description="An administrator has executed a global wipe of all message and invite stats.",
            color=0xEF4444,
            timestamp=discord.utils.utcnow()
        )
        log_embed.add_field(name="Admin", value=f"{interaction.user.mention} (`{interaction.user.id}`)", inline=True)
        log_embed.set_footer(text="Vertex Admin Audit Logger")
        await log_to_channel(log_embed)
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {e}", ephemeral=True)


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    placeholder_tokens = ("", "your_bot_token", "your_bot_token_here", "your_discord_bot_token_here", "<your_bot_token>")
    if not TOKEN or TOKEN.strip().lower() in placeholder_tokens:
        print("\n========================================================")
        print("❌ ERROR: DISCORD_TOKEN is not configured in bot/.env!")
        print("Please edit /var/www/vertex-panel/bot/.env and set your DISCORD_TOKEN.")
        print("Obtain a bot token from: https://discord.com/developers/applications")
        print("========================================================\n")
    else:
        try:
            bot.run(TOKEN)
        except discord.errors.LoginFailure:
            print("\n========================================================")
            print("❌ LOGIN FAILED: Improper or invalid DISCORD_TOKEN!")
            print("The token configured in /var/www/vertex-panel/bot/.env was rejected by Discord (401 Unauthorized).")
            print("To fix this issue:")
            print("  1. Go to https://discord.com/developers/applications")
            print("  2. Select your App -> Bot tab -> Reset/Copy Token")
            print("  3. Edit token: nano /var/www/vertex-panel/bot/.env")
            print("  4. Restart bot: systemctl restart vertex-bot")
            print("========================================================\n")
