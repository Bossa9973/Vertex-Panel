import discord
from discord.ext import commands, tasks
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
        await self.load_extension("cogs.backup")
        await self.load_extension("cogs.abuse")
        self.add_view(StatsView())  # Restore persistent views on restart
        pterodactyl_dm_task.start()  # Start Pterodactyl DM delivery loop
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

# ─── Pterodactyl Deploy DM Task ───────────────────────────────────────────────

@tasks.loop(seconds=60)
async def pterodactyl_dm_task():
    """
    Background task: polls the panel every 60 s for pending Pterodactyl deploy
    DMs and sends a Discord DM embed to each user with their panel credentials.
    """
    try:
        pending = await panel_api.poll_pterodactyl_dm_queue()
    except Exception as e:
        print(f"[ptero_dm] poll failed: {e}")
        return

    for item in pending:
        discord_id = str(item.get("discord_id", ""))
        queue_id   = item.get("id")
        status     = item.get("status", "complete")

        if not discord_id or not queue_id:
            continue

        try:
            user = await bot.fetch_user(int(discord_id))
        except Exception:
            print(f"[ptero_dm] Could not fetch Discord user {discord_id}")
            await panel_api.mark_pterodactyl_dm_sent(queue_id)
            continue

        try:
            if status == "complete":
                embed = discord.Embed(
                    title="🎉 Your Pterodactyl Panel is Ready!",
                    description="Your Pterodactyl Panel + Wings installation has completed successfully.",
                    color=0x5865F2,
                )
                embed.add_field(
                    name="🔗 Panel URL",
                    value=f"https://{item.get('panel_fqdn', 'your-panel.example.com')}",
                    inline=False,
                )
                embed.add_field(
                    name="📧 Admin Email",
                    value=f"`{item.get('admin_email', 'N/A')}`",
                    inline=True,
                )
                embed.add_field(
                    name="🔑 Admin Password",
                    value=f"`{item.get('admin_password', 'N/A')}`",
                    inline=True,
                )
                embed.add_field(
                    name="🌐 Wings FQDN",
                    value=f"`{item.get('wings_fqdn', 'N/A')}`",
                    inline=False,
                )
                embed.add_field(
                    name="⚠️ Next Steps",
                    value=(
                        "1. Log in to your panel with the credentials above.\n"
                        "2. In Cloudflare Zero Trust → Tunnels, add **public hostnames** "
                        f"for `{item.get('panel_fqdn', '')}` (port 80) "
                        f"and `{item.get('wings_fqdn', '')}` (port 8080).\n"
                        "3. Your Wings node should connect automatically within 2 minutes."
                    ),
                    inline=False,
                )
                embed.set_footer(text="Vertex Panel • Pterodactyl Auto-Deploy")
                embed.timestamp = datetime.datetime.utcnow()
            else:
                error_msg = item.get("error") or "Unknown installation error."
                embed = discord.Embed(
                    title="❌ Pterodactyl Installation Failed",
                    description=(
                        f"The installation encountered an error:\n```{error_msg[:500]}```\n"
                        "Please contact support with your deploy ID."
                    ),
                    color=0xEF4444,
                )
                embed.add_field(
                    name="Deploy ID",
                    value=str(item.get("deploy_id", "N/A")),
                    inline=True,
                )
                embed.set_footer(text="Vertex Panel • Pterodactyl Auto-Deploy")
                embed.timestamp = datetime.datetime.utcnow()

            await user.send(embed=embed)
            print(f"[ptero_dm] DM sent to {discord_id} (deploy #{item.get('deploy_id')}, status={status})")
        except discord.Forbidden:
            print(f"[ptero_dm] Cannot DM {discord_id} — DMs disabled")
        except Exception as e:
            print(f"[ptero_dm] Error sending DM to {discord_id}: {e}")

        # Always mark as sent to avoid re-delivery (even if DM failed)
        await panel_api.mark_pterodactyl_dm_sent(queue_id)

@pterodactyl_dm_task.before_loop
async def before_ptero_dm_task():
    await bot.wait_until_ready()

@bot.tree.error
async def on_tree_error(interaction: discord.Interaction, error: AppCommandError):
    err_str = str(error)
    if "10062" in err_str or "Unknown interaction" in err_str:
        print(f"[tree_error] Interaction expired (10062): {error}")
        return

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
            "`/add_balance @user amount [reason]` — Add BOLT balance directly to a user account (Admin Only)\n"
            "`/deduct_balance @user amount [reason]` — Deduct BOLT balance directly from a user account (Admin Only)\n"
            "`/set_balance @user amount [reason]` — Hard set a user's balance with multi-step safety warnings (Admin Only)\n"
            "`/add_bolts @user` — Interactive Bolt Promo Code Generator with History & Presets (Admin Only)\n"
            "`/revoke_promo [@user]` — Select and revoke active promo codes via dropdown menu (Admin Only)\n"
            "`/vm-delete @user` — Staff VM deletion workflow with multi-step owner verification & HTML transcript (Admin Only)\n"
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
        if promo.get("revoked"):
            p_status = "🚫 Revoked"
        elif promo.get("used"):
            p_status = "✅ Claimed"
        else:
            p_status = "⏳ Unclaimed"
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
            if p.get("revoked"):
                status = "🚫 REVOKED"
            elif p.get("used"):
                status = "✅ CLAIMED"
            else:
                status = "⏳ UNCLAIMED"
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
    await interaction.response.defer(ephemeral=True)

    if not is_admin(interaction):
        return await interaction.followup.send("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)

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
    await interaction.response.defer(ephemeral=True)

    if not is_admin(interaction):
        return await interaction.followup.send("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)

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
    is_standard = "standard" in deletion_method.lower()
    method_badge_class = "badge-emerald" if is_standard else "badge-amber"
    method_label = "Standard Hypervisor Uninstall" if is_standard else "Automatic Database Wipe Fallback"

    doc_ref = f"DEL-VM{vmid}-{int(time.time())}"
    avatar_char = (user_name[:1] if user_name else "U").upper()

    return f"""<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Vertex Cloud — Instance Deprovisioning Log #{doc_ref}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap">
    <style>
        :root {{
            --bg-base: #0B0D11;
            --bg-surface: #121418;
            --bg-card: #16181D;
            --bg-card-inner: #0E1014;
            --border-subtle: rgba(255, 255, 255, 0.08);
            --border-light: rgba(255, 255, 255, 0.12);
            --text-primary: #FFFFFF;
            --text-secondary: #94A3B8;
            --text-muted: #64748B;
            --brand-primary: #6366F1;
            --brand-indigo: #4F46E5;
            --brand-blue: #3B82F6;
            --accent-emerald: #10B981;
            --accent-rose: #EF4444;
            --accent-amber: #F59E0B;
            --accent-discord: #5865F2;
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            background-color: var(--bg-base);
            color: var(--text-secondary);
            font-family: 'Geist', 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.5;
            min-height: 100vh;
            padding: 40px 16px;
            background-image: 
                radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.12) 0%, transparent 60%),
                radial-gradient(circle at 100% 100%, rgba(239, 68, 68, 0.04) 0%, transparent 40%);
            background-attachment: fixed;
        }}

        .layout-container {{
            max-width: 880px;
            margin: 0 auto;
        }}

        /* ─── SVG Icons Helper ─────────────────────────────────────────────────── */
        .icon {{
            display: inline-block;
            vertical-align: middle;
            flex-shrink: 0;
        }}

        /* ─── Top Navbar ────────────────────────────────────────────────────────── */
        .navbar {{
            background: rgba(18, 20, 24, 0.85);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--border-subtle);
            border-radius: 18px;
            padding: 14px 22px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        }}

        .brand-group {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}

        .logo-icon {{
            width: 24px;
            height: 24px;
            color: #FFFFFF;
            fill: currentColor;
        }}

        .brand-title {{
            font-size: 14px;
            font-weight: 800;
            color: var(--text-primary);
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .brand-badge {{
            font-size: 10px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 6px;
            background: rgba(99, 102, 241, 0.15);
            border: 1px solid rgba(99, 102, 241, 0.3);
            color: #A5B4FC;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}

        .breadcrumb {{
            font-size: 12px;
            color: var(--text-muted);
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
        }}

        .breadcrumb span {{
            color: var(--text-secondary);
        }}

        /* ─── Profile & Status Hero ─────────────────────────────────────────────── */
        .hero-banner {{
            background: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            border-radius: 20px;
            padding: 24px 26px;
            margin-bottom: 18px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
        }}

        .user-meta-group {{
            display: flex;
            align-items: center;
            gap: 16px;
        }}

        .avatar-initial {{
            width: 52px;
            height: 52px;
            border-radius: 16px;
            background: linear-gradient(135deg, #3B82F6 0%, #6366F1 50%, #4F46E5 100%);
            color: #FFFFFF;
            font-weight: 800;
            font-size: 20px;
            display: grid;
            place-items: center;
            box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3);
            flex-shrink: 0;
        }}

        .user-details h1 {{
            font-size: 19px;
            font-weight: 800;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }}

        .user-id-tag {{
            font-family: 'Geist Mono', 'JetBrains Mono', monospace;
            font-size: 12px;
            color: var(--text-muted);
            font-weight: 500;
        }}

        .user-chips {{
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 5px;
            flex-wrap: wrap;
            font-size: 12px;
        }}

        .chip-discord {{
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: rgba(88, 101, 242, 0.12);
            border: 1px solid rgba(88, 101, 242, 0.25);
            color: #A5B4FC;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            font-family: 'Geist Mono', monospace;
        }}

        .chip-email {{
            color: var(--text-muted);
            font-family: 'Geist Mono', monospace;
            font-size: 12px;
        }}

        .status-pill {{
            padding: 6px 14px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.2);
        }}

        .status-pill-red {{
            background: rgba(239, 68, 68, 0.12);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #F87171;
        }}

        /* ─── Callout Notice ────────────────────────────────────────────────────── */
        .notice-banner {{
            background: rgba(239, 68, 68, 0.07);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-left: 4px solid var(--accent-rose);
            border-radius: 12px;
            padding: 14px 18px;
            margin-bottom: 20px;
            font-size: 13px;
            color: #FECACA;
            line-height: 1.6;
            display: flex;
            gap: 12px;
            align-items: flex-start;
        }}

        .notice-icon {{
            color: var(--accent-rose);
            margin-top: 2px;
        }}

        .notice-body strong {{
            color: #FFFFFF;
            font-weight: 700;
            display: block;
            margin-bottom: 2px;
            font-size: 13px;
        }}

        /* ─── Metric & Spec Cards Grid ──────────────────────────────────────────── */
        .grid-2 {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
            gap: 18px;
            margin-bottom: 20px;
        }}

        .panel-card {{
            background: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            border-radius: 18px;
            padding: 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }}

        .panel-card-header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border-subtle);
            padding-bottom: 12px;
            margin-bottom: 14px;
        }}

        .panel-card-title {{
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .meta-list {{
            display: flex;
            flex-direction: column;
            gap: 10px;
        }}

        .meta-item {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            padding: 3px 0;
            gap: 12px;
        }}

        .meta-label {{
            color: var(--text-muted);
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
        }}

        .meta-value {{
            color: var(--text-primary);
            font-weight: 600;
            text-align: right;
        }}

        .code-pill {{
            font-family: 'Geist Mono', 'JetBrains Mono', monospace;
            background: var(--bg-card-inner);
            border: 1px solid var(--border-subtle);
            padding: 2px 7px;
            border-radius: 5px;
            color: #38BDF8;
            font-size: 12px;
        }}

        .badge-emerald {{
            background: rgba(16, 185, 129, 0.12);
            border: 1px solid rgba(16, 185, 129, 0.25);
            color: #34D399;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }}

        .badge-amber {{
            background: rgba(245, 158, 11, 0.12);
            border: 1px solid rgba(245, 158, 11, 0.25);
            color: #FBBF24;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }}

        /* ─── Audit Trail & Timeline ────────────────────────────────────────────── */
        .timeline-section {{
            background: var(--bg-surface);
            border: 1px solid var(--border-subtle);
            border-radius: 18px;
            padding: 22px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            margin-bottom: 20px;
        }}

        .timeline-title {{
            font-size: 14px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
        }}

        .timeline-title-left {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .timeline-step {{
            position: relative;
            padding-left: 34px;
            margin-bottom: 22px;
        }}

        .timeline-step:last-child {{
            margin-bottom: 0;
        }}

        .timeline-node {{
            position: absolute;
            left: 0;
            top: 2px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: var(--bg-base);
            border: 2px solid var(--brand-primary);
            box-shadow: 0 0 8px rgba(99, 102, 241, 0.4);
            display: grid;
            place-items: center;
        }}

        .timeline-node::after {{
            content: '';
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--brand-primary);
        }}

        .timeline-step::before {{
            content: '';
            position: absolute;
            left: 8px;
            top: 22px;
            bottom: -16px;
            width: 2px;
            background: var(--border-subtle);
        }}

        .timeline-step:last-child::before {{
            display: none;
        }}

        .step-heading {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            margin-bottom: 5px;
            flex-wrap: wrap;
        }}

        .step-title-text {{
            font-weight: 700;
            color: var(--text-primary);
            font-size: 13px;
        }}

        .step-timestamp {{
            font-family: 'Geist Mono', monospace;
            font-size: 11px;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 4px;
        }}

        .step-box {{
            background: var(--bg-card-inner);
            border: 1px solid var(--border-subtle);
            border-radius: 10px;
            padding: 10px 14px;
            font-size: 13px;
            color: var(--text-secondary);
            margin-top: 6px;
            line-height: 1.6;
        }}

        .user-quote-box {{
            background: #090A0D;
            border: 1px solid rgba(245, 158, 11, 0.3);
            border-left: 3px solid var(--accent-amber);
            border-radius: 6px;
            padding: 7px 12px;
            font-family: 'Geist Mono', 'JetBrains Mono', monospace;
            color: #FCD34D;
            font-size: 12px;
            margin-top: 8px;
            display: inline-block;
            max-width: 100%;
            word-break: break-word;
        }}

        /* ─── Footer ────────────────────────────────────────────────────────────── */
        .page-footer {{
            border-top: 1px solid var(--border-subtle);
            padding-top: 18px;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            font-size: 12px;
            color: var(--text-muted);
        }}

        .security-seal {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.25);
            color: #34D399;
            padding: 4px 9px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 11px;
            text-transform: uppercase;
        }}

        /* ─── Responsive Adjustments (Mobile & Desktop) ─────────────────────────── */
        @media (max-width: 680px) {{
            body {{
                padding: 16px 12px;
            }}
            .navbar {{
                padding: 12px 16px;
                flex-direction: column;
                align-items: flex-start;
                gap: 8px;
                border-radius: 14px;
            }}
            .breadcrumb {{
                font-size: 11px;
            }}
            .hero-banner {{
                padding: 18px 16px;
                flex-direction: column;
                align-items: flex-start;
                gap: 14px;
                border-radius: 16px;
            }}
            .avatar-initial {{
                width: 44px;
                height: 44px;
                font-size: 17px;
                border-radius: 12px;
            }}
            .user-details h1 {{
                font-size: 17px;
            }}
            .grid-2 {{
                grid-template-columns: 1fr;
                gap: 14px;
            }}
            .panel-card {{
                padding: 16px;
                border-radius: 16px;
            }}
            .meta-item {{
                flex-direction: column;
                align-items: flex-start;
                gap: 3px;
            }}
            .meta-value {{
                text-align: left;
                word-break: break-all;
            }}
            .timeline-section {{
                padding: 18px 14px;
                border-radius: 16px;
            }}
            .timeline-step {{
                padding-left: 28px;
            }}
            .timeline-node {{
                left: -1px;
            }}
            .timeline-step::before {{
                left: 7px;
            }}
            .step-heading {{
                flex-direction: column;
                align-items: flex-start;
                gap: 3px;
            }}
            .page-footer {{
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }}
        }}
    </style>
</head>
<body>
    <div class="layout-container">
        <!-- Top Navigation -->
        <header class="navbar">
            <div class="brand-group">
                <svg class="logo-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 245.25 214.5">
                    <path fill="currentColor" d="m9.164 19.504 41.027-.035c5.563-.008 16.586-.36 21.66.191 2.993 4.883 8.012 16.746 10.778 22.567l25.086 53.34 8.629 18.25c1.562 3.351 4.015 9.035 5.773 12.07 8.57.164 18.934.62 27.29-.508 4.398-.598 9.769-15.317 11.566-19.258l13.425-29.246c1.942-4.184 3.895-9.008 6.036-13.023 6.039-.473 15.566-.145 21.918-.137l36.91.027c-7.653 16.188-14.82 32.664-22.446 48.785-1.152 2.778-4.566 10.387-6.207 12.653-4.093.492-11.168.261-15.445.246l-26.574-.114c-5.285-.019-14.778-1.41-17.598 3.782-2.734 5.031-5.066 10.754-7.36 16.054l-15.058 34.008c-1.765 3.95-5.816 13.711-7.887 17.035-1.425.133-2.878.18-4.308.172-9.137-.05-18.363.153-27.488-.074-3.106-5.809-5.79-12.16-8.48-18.2l-11.122-24.683-43.676-95.96c-1.547-3.368-16.988-37.067-16.968-37.65Zm0 0"/>
                </svg>
                <span class="brand-title">VERTEX CLOUD <span class="brand-badge">Audit Log</span></span>
            </div>
            <div class="breadcrumb">
                <span>Infrastructure</span> / <span>Deprovisioning</span> / <span>Receipt</span>
            </div>
        </header>

        <!-- Profile & Status Hero Header -->
        <div class="hero-banner">
            <div class="user-meta-group">
                <div class="avatar-initial">{avatar_char}</div>
                <div class="user-details">
                    <h1>{html.escape(user_name)} <span class="user-id-tag">#{html.escape(user_id)}</span></h1>
                    <div class="user-chips">
                        <span class="chip-email">{html.escape(user_email)}</span>
                        <span class="chip-discord">
                            <svg class="icon" style="width:13px;height:13px;fill:currentColor;" viewBox="0 0 24 24"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
                            {html.escape(user_name)}
                        </span>
                    </div>
                </div>
            </div>
            <div>
                <div class="status-pill status-pill-red">
                    <svg class="icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Permanently Decommissioned
                </div>
            </div>
        </div>

        <!-- Clean Notice Banner -->
        <div class="notice-banner">
            <svg class="icon notice-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div class="notice-body">
                <strong>Resource Deprovisioning Log</strong>
                This instance was permanently deleted from the hypervisor. Disk volumes, snapshots, and IP allocations have been purged according to the confirmed authorization steps below.
            </div>
        </div>

        <!-- Grid: Target VM Details & Responsible Parties -->
        <div class="grid-2">
            <!-- Card 1: Virtual Machine Details -->
            <div class="panel-card">
                <div class="panel-card-header">
                    <span class="panel-card-title">
                        <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                        Target Instance
                    </span>
                    <span class="code-pill">VMID #{html.escape(str(vmid))}</span>
                </div>
                <div class="meta-list">
                    <div class="meta-item">
                        <span class="meta-label">Instance Name:</span>
                        <span class="meta-value">{html.escape(server_name)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Node / Cluster:</span>
                        <span class="meta-value">{html.escape(node_name)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Allocated IP:</span>
                        <span class="meta-value"><span class="code-pill">{html.escape(node_ip)}</span></span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Hardware Specs:</span>
                        <span class="meta-value">{html.escape(specs_str)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Decommission Mode:</span>
                        <span class="meta-value">
                            <span class="{method_badge_class}">
                                <svg class="icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                {method_label}
                            </span>
                        </span>
                    </div>
                </div>
            </div>

            <!-- Card 2: Responsible Parties -->
            <div class="panel-card">
                <div class="panel-card-header">
                    <span class="panel-card-title">
                        <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        Authorization & Context
                    </span>
                    <span class="code-pill">{doc_ref}</span>
                </div>
                <div class="meta-list">
                    <div class="meta-item">
                        <span class="meta-label">Instance Owner:</span>
                        <span class="meta-value">{html.escape(user_name)} (<span class="code-pill">{html.escape(user_id)}</span>)</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Initiating Staff:</span>
                        <span class="meta-value">{html.escape(admin_name)} (<span class="code-pill">{html.escape(admin_id)}</span>)</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Guild Context:</span>
                        <span class="meta-value">{html.escape(guild_name)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Channel Context:</span>
                        <span class="meta-value">#{html.escape(channel_name)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">Executed At:</span>
                        <span class="meta-value" style="font-family: 'Geist Mono', monospace; font-size: 12px;">{html.escape(completed_time)}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Audit Timeline / Agreement History -->
        <div class="timeline-section">
            <div class="timeline-title">
                <div class="timeline-title-left">
                    <svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>Authorization Sequence & Audit Trail</span>
                </div>
                <span class="code-pill">4 Steps Confirmed</span>
            </div>

            <!-- Step 1 -->
            <div class="timeline-step">
                <div class="timeline-node"></div>
                <div class="step-heading">
                    <span class="step-title-text">1. Initial Deletion Warning & Data Loss Notice</span>
                    <span class="step-timestamp">
                        <svg class="icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {html.escape(step1_time)}
                    </span>
                </div>
                <div class="step-box">
                    Owner was notified that all persistent storage volumes, operating system data, and backups associated with <strong>{html.escape(server_name)}</strong> (VMID: <code>{html.escape(str(vmid))}</code>) will be permanently destroyed.
                </div>
            </div>

            <!-- Step 2 -->
            <div class="timeline-step">
                <div class="timeline-node"></div>
                <div class="step-heading">
                    <span class="step-title-text">2. Staff Error & Owner Responsibility Agreement</span>
                    <span class="step-timestamp">
                        <svg class="icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {html.escape(step2_time)}
                    </span>
                </div>
                <div class="step-box">
                    <strong>Agreed Terms:</strong> <em>"Administrators and staff members can make mistakes. As the verified server owner, I am solely responsible for the deletion of this virtual machine, as staff members only dispatch deletion requests that I requested. Vertex Host and administrators are discharged from all liability."</em>
                </div>
            </div>

            <!-- Step 3 -->
            <div class="timeline-step">
                <div class="timeline-node"></div>
                <div class="step-heading">
                    <span class="step-title-text">3. Explicit Written Verification String Submission</span>
                    <span class="step-timestamp">
                        <svg class="icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {html.escape(step3_time)}
                    </span>
                </div>
                <div class="step-box">
                    Owner typed and confirmed the exact authorization phrase:
                    <div class="user-quote-box">"{html.escape(written_message)}"</div>
                </div>
            </div>

            <!-- Step 4 -->
            <div class="timeline-step">
                <div class="timeline-node"></div>
                <div class="step-heading">
                    <span class="step-title-text">Step 4: Hypervisor Destruction & Database Purge Complete</span>
                    <span class="step-timestamp">{html.escape(completed_time)}</span>
                </div>
                <div class="step-box">
                    Instance decommission executed via <strong>{method_label}</strong>. Hypervisor compute resources purged, IPv4 address bindings released, and server database records removed.
                </div>
            </div>
        </div>

        <!-- Footer -->
        <footer class="page-footer">
            <div class="security-seal">
                🔒 Cryptographic Audit Record Verified
            </div>
            <div>
                &copy; 2020 - 2026 <strong style="color:var(--text-primary)">Vertex Cloud</strong>. Preserved for compliance & security.
            </div>
        </footer>
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


# ─── Admin: /add_balance ──────────────────────────────────────────────────────

@bot.tree.command(name="add_balance", description="Add BOLTs / balance to a user's account (Admin Only)")
@discord.app_commands.describe(
    user="The target user to grant balance to",
    amount="Amount of BOLTs to add",
    reason="Optional reason for the balance grant"
)
async def add_balance(
    interaction: discord.Interaction,
    user: Union[discord.Member, discord.User],
    amount: float,
    reason: Optional[str] = "Admin Credit Grant"
):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)

    if amount <= 0:
        return await interaction.response.send_message("❌ Please enter a positive amount of BOLTs to add.", ephemeral=True)

    await interaction.response.defer(ephemeral=True)

    res = await panel_api.admin_add_balance(
        discord_id=str(user.id),
        amount=amount,
        admin_discord_id=str(interaction.user.id),
        reason=reason or "Admin Credit Grant"
    )

    if not res.get("ok"):
        err_msg = res.get("error") or "Failed to add balance to user."
        embed = discord.Embed(title="❌ Balance Add Failed", description=err_msg, color=0xEF4444)
        embed.set_footer(text="Vertex Admin Control Panel | Balance Operations")
        return await interaction.followup.send(embed=embed, ephemeral=True)

    old_bal = safe_float(res.get("old_balance"))
    new_bal = safe_float(res.get("new_balance"))
    added_amt = safe_float(res.get("amount_added", amount))

    success_embed = discord.Embed(
        title="⚡ Balance Added Successfully",
        description=f"Successfully credited **{user.mention}** with **⚡ {added_amt:,.2f} BOLTs**.",
        color=0x22C55E
    )
    success_embed.add_field(name="Target User", value=f"{user.mention} (`{user.id}`)", inline=True)
    success_embed.add_field(name="Amount Added", value=f"**+⚡ {added_amt:,.2f} BOLTs**", inline=True)
    success_embed.add_field(name="Administrator", value=f"{interaction.user.mention}", inline=True)
    success_embed.add_field(name="Previous Balance", value=f"`{old_bal:,.2f} BOLTs`", inline=True)
    success_embed.add_field(name="New Balance", value=f"**`⚡ {new_bal:,.2f} BOLTs`**", inline=True)
    success_embed.add_field(name="Reason", value=f"`{reason or 'Admin Credit Grant'}`", inline=True)
    success_embed.set_footer(text="Vertex Admin Control Panel | Balance Operations")
    success_embed.timestamp = discord.utils.utcnow()

    await interaction.followup.send(embed=success_embed, ephemeral=True)

    # Audit log
    log_embed = discord.Embed(
        title="⚡ [Audit Log] User Balance Added",
        color=0x22C55E,
        timestamp=discord.utils.utcnow()
    )
    log_embed.add_field(name="Admin", value=f"{interaction.user.mention} (`{interaction.user.id}`)", inline=True)
    log_embed.add_field(name="Target User", value=f"{user.mention} (`{user.id}`)", inline=True)
    log_embed.add_field(name="Amount Added", value=f"**+⚡ {added_amt:,.2f} BOLTs**", inline=True)
    log_embed.add_field(name="Old Balance", value=f"`{old_bal:,.2f} BOLTs`", inline=True)
    log_embed.add_field(name="New Balance", value=f"**`{new_bal:,.2f} BOLTs`**", inline=True)
    log_embed.add_field(name="Reason", value=f"`{reason or 'Admin Credit Grant'}`", inline=True)
    log_embed.set_footer(text="Vertex Admin Audit Logger")
    await log_to_channel(log_embed)


# ─── Admin: /deduct_balance ───────────────────────────────────────────────────

@bot.tree.command(name="deduct_balance", description="Deduct BOLTs / balance from a user's account (Admin Only)")
@discord.app_commands.describe(
    user="The target user to deduct balance from",
    amount="Amount of BOLTs to deduct",
    reason="Optional reason for the deduction"
)
async def deduct_balance(
    interaction: discord.Interaction,
    user: Union[discord.Member, discord.User],
    amount: float,
    reason: Optional[str] = "Admin Credit Deduction"
):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)

    if amount <= 0:
        return await interaction.response.send_message("❌ Please enter a positive amount of BOLTs to deduct.", ephemeral=True)

    await interaction.response.defer(ephemeral=True)

    res = await panel_api.admin_deduct_balance(
        discord_id=str(user.id),
        amount=amount,
        admin_discord_id=str(interaction.user.id),
        reason=reason or "Admin Credit Deduction"
    )

    if not res.get("ok"):
        err_msg = res.get("error") or "Failed to deduct balance from user."
        embed = discord.Embed(title="❌ Balance Deduction Failed", description=err_msg, color=0xEF4444)
        embed.set_footer(text="Vertex Admin Control Panel | Balance Operations")
        return await interaction.followup.send(embed=embed, ephemeral=True)

    old_bal = safe_float(res.get("old_balance"))
    new_bal = safe_float(res.get("new_balance"))
    deducted_amt = safe_float(res.get("amount_deducted", amount))

    success_embed = discord.Embed(
        title="📉 Balance Deducted Successfully",
        description=f"Successfully deducted **⚡ {deducted_amt:,.2f} BOLTs** from **{user.mention}**.",
        color=0xF59E0B
    )
    success_embed.add_field(name="Target User", value=f"{user.mention} (`{user.id}`)", inline=True)
    success_embed.add_field(name="Amount Deducted", value=f"**-⚡ {deducted_amt:,.2f} BOLTs**", inline=True)
    success_embed.add_field(name="Administrator", value=f"{interaction.user.mention}", inline=True)
    success_embed.add_field(name="Previous Balance", value=f"`{old_bal:,.2f} BOLTs`", inline=True)
    success_embed.add_field(name="New Balance", value=f"**`⚡ {new_bal:,.2f} BOLTs`**", inline=True)
    success_embed.add_field(name="Reason", value=f"`{reason or 'Admin Credit Deduction'}`", inline=True)
    success_embed.set_footer(text="Vertex Admin Control Panel | Balance Operations")
    success_embed.timestamp = discord.utils.utcnow()

    await interaction.followup.send(embed=success_embed, ephemeral=True)

    # Audit log
    log_embed = discord.Embed(
        title="📉 [Audit Log] User Balance Deducted",
        color=0xF59E0B,
        timestamp=discord.utils.utcnow()
    )
    log_embed.add_field(name="Admin", value=f"{interaction.user.mention} (`{interaction.user.id}`)", inline=True)
    log_embed.add_field(name="Target User", value=f"{user.mention} (`{user.id}`)", inline=True)
    log_embed.add_field(name="Amount Deducted", value=f"**-⚡ {deducted_amt:,.2f} BOLTs**", inline=True)
    log_embed.add_field(name="Old Balance", value=f"`{old_bal:,.2f} BOLTs`", inline=True)
    log_embed.add_field(name="New Balance", value=f"**`{new_bal:,.2f} BOLTs`**", inline=True)
    log_embed.add_field(name="Reason", value=f"`{reason or 'Admin Credit Deduction'}`", inline=True)
    log_embed.set_footer(text="Vertex Admin Audit Logger")
    await log_to_channel(log_embed)


# ─── Admin: /set_balance (Hard Set Flow with Sequential Warnings) ─────────────

class HardSetBalanceFlow:
    """Manages the multi-step warning flow for hard setting user balance."""

    def __init__(
        self,
        admin: discord.Member,
        target_user: Union[discord.Member, discord.User],
        target_amount: float,
        reason: str,
        user_history_data: dict
    ):
        self.admin = admin
        self.target_user = target_user
        self.target_amount = round(target_amount, 2)
        self.reason = reason or "Staff Hard Ledger Override"
        self.data = user_history_data or {}

    def build_warning_step1_embed(self) -> discord.Embed:
        d = self.data or {}
        u = d.get("user") or {}
        summary = d.get("summary") or {}
        current_balance = safe_float(summary.get("current_balance", d.get("balance", 0.0)))
        diff = round(self.target_amount - current_balance, 2)
        diff_sign = "+" if diff > 0 else ""

        user_name = safe_str(u.get("name") or self.target_user.name)
        user_email = safe_str(u.get("email") or "Not Linked")

        embed = discord.Embed(
            title="⚠️ CRITICAL WARNING: Hard Set User Balance // Step 1 of 2",
            description=(
                f"You are initiating a **forceful ledger overwrite** for **{self.target_user.mention}**.\n\n"
                f"• **Account:** {user_name} (`{user_email}`)\n"
                f"• **Current Balance:** `{current_balance:,.2f} BOLTs`\n"
                f"• **Target Hard Balance:** `⚡ {self.target_amount:,.2f} BOLTs`\n"
                f"• **Net Ledger Adjustment:** `⚡ {diff_sign}{diff:,.2f} BOLTs`\n"
                f"• **Reason:** `{self.reason}`\n\n"
                "⚠️ **IMPORTANT NOTICE:**\n"
                "Hard setting balance **forcefully overwrites** the user's available credits in the database directly. "
                "All future server renewals and billing cycles will immediately compute against this new hard balance."
            ),
            color=0xF59E0B
        )
        embed.set_footer(text="Warning Step 1/2 • Vertex High-Impact Balance Override")
        return embed

    def build_warning_step2_embed(self) -> discord.Embed:
        d = self.data or {}
        summary = d.get("summary") or {}
        current_balance = safe_float(summary.get("current_balance", d.get("balance", 0.0)))
        diff = round(self.target_amount - current_balance, 2)
        diff_sign = "+" if diff > 0 else ""

        embed = discord.Embed(
            title="🚨 SEVERE WARNING: Final Verification Required // Step 2 of 2",
            description=(
                "🛑 **ARE YOU ABSOLUTELY SURE YOU WANT TO OVERWRITE THIS BALANCE?**\n\n"
                f"• **Target Recipient:** {self.target_user.mention} (`{self.target_user.id}`)\n"
                f"• **Current Balance:** `{current_balance:,.2f} BOLTs`\n"
                f"• **NEW HARD BALANCE:** **`⚡ {self.target_amount:,.2f} BOLTs`**\n"
                f"• **Net Change:** `⚡ {diff_sign}{diff:,.2f} BOLTs`\n"
                f"• **Operator:** {self.admin.mention} (`{self.admin.id}`)\n"
                f"• **Logged Reason:** `{self.reason}`\n\n"
                "🔥 **Clicking confirm will immediately execute the database update.** "
                "This action cannot be undone automatically and will be permanently recorded in audit logs."
            ),
            color=0xEF4444
        )
        embed.set_footer(text="Warning Step 2/2 • Final Confirmation Required")
        return embed

    async def start(self, interaction: discord.Interaction):
        flow = self

        class Warning1View(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)

            async def interaction_check(self, i: discord.Interaction) -> bool:
                if i.user.id != flow.admin.id:
                    await i.response.send_message("❌ This confirmation belongs to another administrator.", ephemeral=True)
                    return False
                return True

            @discord.ui.button(label="⚠️ Acknowledge Risk & Proceed to Final Warning", style=discord.ButtonStyle.danger, emoji="⚠️")
            async def on_proceed(self, i: discord.Interaction, btn: discord.ui.Button):
                await flow.show_warning_step2(i)

            @discord.ui.button(label="❌ Abort & Cancel", style=discord.ButtonStyle.secondary, emoji="✖️")
            async def on_cancel(self, i: discord.Interaction, btn: discord.ui.Button):
                cancel_embed = discord.Embed(
                    title="❌ Action Aborted",
                    description="Hard balance overwrite was cancelled. No changes were made.",
                    color=0x9CA3AF
                )
                await i.response.edit_message(embed=cancel_embed, view=None)

        await interaction.followup.send(embed=self.build_warning_step1_embed(), view=Warning1View(), ephemeral=True)

    async def show_warning_step2(self, interaction: discord.Interaction):
        flow = self

        class Warning2View(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)

            async def interaction_check(self, i: discord.Interaction) -> bool:
                if i.user.id != flow.admin.id:
                    await i.response.send_message("❌ This confirmation belongs to another administrator.", ephemeral=True)
                    return False
                return True

            @discord.ui.button(label="🔴 OVERWRITE BALANCE NOW", style=discord.ButtonStyle.danger, emoji="🔥")
            async def on_confirm(self, i: discord.Interaction, btn: discord.ui.Button):
                await flow.execute_hard_set(i)

            @discord.ui.button(label="❌ Abort & Cancel", style=discord.ButtonStyle.secondary, emoji="✖️")
            async def on_cancel(self, i: discord.Interaction, btn: discord.ui.Button):
                cancel_embed = discord.Embed(
                    title="❌ Action Aborted",
                    description="Hard balance overwrite was cancelled. No changes were made.",
                    color=0x9CA3AF
                )
                await i.response.edit_message(embed=cancel_embed, view=None)

        await interaction.response.edit_message(embed=self.build_warning_step2_embed(), view=Warning2View())

    async def execute_hard_set(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        res = await panel_api.admin_set_balance(
            discord_id=str(self.target_user.id),
            amount=self.target_amount,
            admin_discord_id=str(self.admin.id),
            reason=self.reason
        )

        if not res.get("ok"):
            err_msg = res.get("error") or "Failed to hard set user balance."
            err_embed = discord.Embed(title="❌ Hard Balance Overwrite Failed", description=err_msg, color=0xEF4444)
            return await interaction.edit_original_response(embed=err_embed, view=None)

        old_bal = safe_float(res.get("old_balance"))
        new_bal = safe_float(res.get("new_balance", self.target_amount))
        diff = safe_float(res.get("difference", new_bal - old_bal))
        diff_sign = "+" if diff > 0 else ""

        success_embed = discord.Embed(
            title="✅ Balance Hard Overwrite Completed",
            description=f"Successfully forced ledger balance for **{self.target_user.mention}** to **⚡ {new_bal:,.2f} BOLTs**.",
            color=0x22C55E
        )
        success_embed.add_field(name="Target User", value=f"{self.target_user.mention} (`{self.target_user.id}`)", inline=True)
        success_embed.add_field(name="Previous Balance", value=f"`{old_bal:,.2f} BOLTs`", inline=True)
        success_embed.add_field(name="New Hard Balance", value=f"**`⚡ {new_bal:,.2f} BOLTs`**", inline=True)
        success_embed.add_field(name="Net Adjustment", value=f"`⚡ {diff_sign}{diff:,.2f} BOLTs`", inline=True)
        success_embed.add_field(name="Administrator", value=f"{self.admin.mention}", inline=True)
        success_embed.add_field(name="Reason", value=f"`{self.reason}`", inline=True)
        success_embed.set_footer(text="Vertex Admin Control Panel | Balance Overwrite Complete")
        success_embed.timestamp = discord.utils.utcnow()

        await interaction.edit_original_response(embed=success_embed, view=None)

        # High priority audit log
        log_embed = discord.Embed(
            title="🚨 [Audit Log] User Balance Hard Overwrite Executed",
            color=0xEF4444,
            timestamp=discord.utils.utcnow()
        )
        log_embed.add_field(name="Admin Operator", value=f"{self.admin.mention} (`{self.admin.id}`)", inline=True)
        log_embed.add_field(name="Target User", value=f"{self.target_user.mention} (`{self.target_user.id}`)", inline=True)
        log_embed.add_field(name="Previous Balance", value=f"`{old_bal:,.2f} BOLTs`", inline=True)
        log_embed.add_field(name="New Hard Balance", value=f"**`⚡ {new_bal:,.2f} BOLTs`**", inline=True)
        log_embed.add_field(name="Net Difference", value=f"`⚡ {diff_sign}{diff:,.2f} BOLTs`", inline=True)
        log_embed.add_field(name="Logged Reason", value=f"`{self.reason}`", inline=True)
        log_embed.set_footer(text="Vertex Admin Security & Audit Logger")
        await log_to_channel(log_embed)


@bot.tree.command(name="set_balance", description="Hard set a user's balance with multi-step safety warnings (Admin Only)")
@discord.app_commands.describe(
    user="The target user to overwrite balance for",
    amount="Target hard balance amount (BOLTs)",
    reason="Optional reason for the hard balance set"
)
async def set_balance(
    interaction: discord.Interaction,
    user: Union[discord.Member, discord.User],
    amount: float,
    reason: Optional[str] = "Staff Hard Ledger Override"
):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)

    if amount < 0:
        return await interaction.response.send_message("❌ Balance amount cannot be negative.", ephemeral=True)

    await interaction.response.defer(ephemeral=True)

    user_history_data = await panel_api.get_user_history(str(user.id))
    if not user_history_data.get("ok") or not user_history_data.get("user"):
        embed = discord.Embed(
            title="❌ User Account Not Found",
            description=f"Could not find a linked Vertex panel account for {user.mention} (`{user.id}`). The user must sign in and link their Discord account in Account Settings first.",
            color=0xEF4444
        )
        return await interaction.followup.send(embed=embed, ephemeral=True)

    flow = HardSetBalanceFlow(
        admin=interaction.user,
        target_user=user,
        target_amount=amount,
        reason=reason or "Staff Hard Ledger Override",
        user_history_data=user_history_data
    )
    await flow.start(interaction)


# ─── Admin: /revoke_promo (Interactive User Select & Burger Dropdown Menu) ───

class RevokePromoInteractiveFlow:
    """Manages the interactive promo revocation flow with UserSelect and Dropdown Select Menu."""

    def __init__(self, admin: discord.Member, target_user: Optional[Union[discord.Member, discord.User]] = None):
        self.admin = admin
        self.target_user = target_user
        self.promos: list[dict] = []
        self.selected_promo: Optional[dict] = None

    async def start(self, interaction: discord.Interaction):
        if self.target_user:
            await self.load_and_display_promos(interaction)
        else:
            await self.show_user_select(interaction)

    async def show_user_select(self, interaction: discord.Interaction):
        flow = self

        embed = discord.Embed(
            title="🎫 Revoke Promo Code // Step 1: Select User",
            description="Please choose the target user below whose active promo codes you wish to inspect and revoke:",
            color=0x3B82F6
        )
        embed.set_footer(text="Vertex Admin Control Panel | Promo Code Revocation")

        class UserSelectView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)

            async def interaction_check(self, i: discord.Interaction) -> bool:
                if i.user.id != flow.admin.id:
                    await i.response.send_message("❌ This session belongs to another administrator.", ephemeral=True)
                    return False
                return True

            @discord.ui.select(cls=discord.ui.UserSelect, placeholder="🍔 Select a user to inspect promo codes...")
            async def on_user_selected(self, i: discord.Interaction, select: discord.ui.UserSelect):
                flow.target_user = select.values[0]
                await flow.load_and_display_promos(i)

        if interaction.response.is_done():
            await interaction.followup.send(embed=embed, view=UserSelectView(), ephemeral=True)
        else:
            await interaction.response.send_message(embed=embed, view=UserSelectView(), ephemeral=True)

    async def load_and_display_promos(self, interaction: discord.Interaction):
        flow = self
        if not interaction.response.is_done():
            await interaction.response.defer(ephemeral=True)

        promos_res = await panel_api.get_user_promos(str(self.target_user.id))
        all_promos = promos_res.get("promos") if promos_res.get("ok") else []

        if not all_promos:
            history_res = await panel_api.get_user_history(str(self.target_user.id))
            all_promos = history_res.get("promo_history") or []

        self.promos = all_promos
        active_promos = [p for p in all_promos if not p.get("used") and not p.get("revoked")]

        if not active_promos:
            if not all_promos:
                embed = discord.Embed(
                    title="ℹ️ No Promo Codes Found",
                    description=f"No promo codes have ever been generated for **{self.target_user.mention}** (`{self.target_user.id}`).",
                    color=0x9CA3AF
                )
            else:
                embed = discord.Embed(
                    title="ℹ️ No Active Unredeemed Promo Codes",
                    description=f"**{self.target_user.mention}** has no active unredeemed promo codes available to revoke.",
                    color=0xF59E0B
                )
                p_lines = []
                for p in all_promos[:8]:
                    st = "🚫 REVOKED" if p.get("revoked") else "✅ CLAIMED" if p.get("used") else "⏳ UNCLAIMED"
                    code = safe_str(p.get("code"))
                    amt = safe_float(p.get("amount"))
                    date = format_date(p.get("created_at") or p.get("timestamp"))
                    p_lines.append(f"• `{code}` (**⚡ {amt:,.0f} BOLTs**) — {st} (`{date}`)")
                add_chunked_fields(embed=embed, field_title="Past Promo Code History", lines=p_lines, max_len=1000)

            embed.set_footer(text="Vertex Admin Control Panel | Promo Revocation")
            if interaction.response.is_done():
                return await interaction.followup.send(embed=embed, ephemeral=True)
            else:
                return await interaction.response.edit_message(embed=embed, view=None)

        # Build burger dropdown select menu
        embed = discord.Embed(
            title="🍔 Select Promo Code to Revoke // Step 2",
            description=(
                f"Found **{len(active_promos)}** active unredeemed promo code(s) for **{self.target_user.mention}**.\n\n"
                "Please select a promo code from the dropdown menu below to invalidate and revoke it:"
            ),
            color=0xF59E0B
        )

        options = []
        for p in active_promos[:25]:
            code = safe_str(p.get("code")).strip()
            amt = safe_float(p.get("amount"))
            date = format_date(p.get("created_at") or p.get("timestamp"))
            reason = truncate_text(p.get("reason") or "Admin Gift", 45)
            options.append(discord.SelectOption(
                label=f"⚡ {amt:,.0f} BOLTs — {code}",
                value=code,
                description=f"Issued {date} • {reason}"[:100],
                emoji="🎫"
            ))

        class PromoDropdown(discord.ui.Select):
            def __init__(self):
                super().__init__(placeholder="🍔 Select a promo code from the menu...", min_values=1, max_values=1, options=options)

            async def callback(self, i: discord.Interaction):
                selected_code = self.values[0]
                matched = next((p for p in active_promos if safe_str(p.get("code")).strip() == selected_code), None)
                flow.selected_promo = matched or {"code": selected_code, "amount": 0}
                await flow.show_revoke_confirmation(i)

        class PromoSelectView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)
                self.add_item(PromoDropdown())

            async def interaction_check(self, i: discord.Interaction) -> bool:
                if i.user.id != flow.admin.id:
                    await i.response.send_message("❌ This session belongs to another administrator.", ephemeral=True)
                    return False
                return True

            @discord.ui.button(label="❌ Cancel", style=discord.ButtonStyle.secondary, row=1)
            async def on_cancel(self, i: discord.Interaction, btn: discord.ui.Button):
                cancel_embed = discord.Embed(title="❌ Cancelled", description="Promo code revocation was cancelled.", color=0x9CA3AF)
                await i.response.edit_message(embed=cancel_embed, view=None)

        if interaction.response.is_done():
            await interaction.followup.send(embed=embed, view=PromoSelectView(), ephemeral=True)
        else:
            await interaction.response.edit_message(embed=embed, view=PromoSelectView())

    async def show_revoke_confirmation(self, interaction: discord.Interaction):
        flow = self
        promo = self.selected_promo or {}
        code = safe_str(promo.get("code"))
        amt = safe_float(promo.get("amount"))
        reason = safe_str(promo.get("reason") or "Admin Gift")
        date = format_date(promo.get("created_at") or promo.get("timestamp"))

        embed = discord.Embed(
            title="⚠️ Confirm Promo Code Revocation",
            description=(
                f"Are you sure you want to permanently revoke promo code **`{code}`**?\n\n"
                f"• **Recipient:** {self.target_user.mention} (`{self.target_user.id}`)\n"
                f"• **Value:** `⚡ {amt:,.2f} BOLTs`\n"
                f"• **Original Reason:** *{reason}*\n"
                f"• **Issued On:** `{date}`\n\n"
                "🚫 **Once revoked, this promo code will be permanently invalidated and cannot be redeemed on the Discord Bot or Web Panel.**"
            ),
            color=0xEF4444
        )

        class ConfirmRevokeView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=180)

            async def interaction_check(self, i: discord.Interaction) -> bool:
                if i.user.id != flow.admin.id:
                    await i.response.send_message("❌ This session belongs to another administrator.", ephemeral=True)
                    return False
                return True

            @discord.ui.button(label="🗑️ Revoke Code Now", style=discord.ButtonStyle.danger, emoji="🗑️")
            async def on_revoke_now(self, i: discord.Interaction, btn: discord.ui.Button):
                await flow.execute_revocation(i, code=code, reason="Revoked by Administrator")

            @discord.ui.button(label="✏️ Custom Revoke Reason", style=discord.ButtonStyle.secondary, emoji="✏️")
            async def on_custom_reason(self, i: discord.Interaction, btn: discord.ui.Button):
                async def reason_cb(modal_i: discord.Interaction, custom_reason: str):
                    await flow.execute_revocation(modal_i, code=code, reason=custom_reason)

                await i.response.send_modal(CustomReasonModal(reason_cb))

            @discord.ui.button(label="❌ Cancel", style=discord.ButtonStyle.secondary)
            async def on_cancel(self, i: discord.Interaction, btn: discord.ui.Button):
                cancel_embed = discord.Embed(title="❌ Cancelled", description="Promo code revocation was cancelled.", color=0x9CA3AF)
                await i.response.edit_message(embed=cancel_embed, view=None)

        await interaction.response.edit_message(embed=embed, view=ConfirmRevokeView())

    async def execute_revocation(self, interaction: discord.Interaction, code: str, reason: str):
        if not interaction.response.is_done():
            await interaction.response.defer(ephemeral=True)

        res = await panel_api.revoke_promo_code(
            code=code,
            admin_discord_id=str(self.admin.id),
            reason=reason
        )

        if not res.get("ok"):
            err_msg = res.get("error") or "Failed to revoke promo code."
            err_embed = discord.Embed(title="❌ Revocation Failed", description=err_msg, color=0xEF4444)
            if interaction.response.is_done():
                return await interaction.followup.send(embed=err_embed, ephemeral=True)
            else:
                return await interaction.response.edit_message(embed=err_embed, view=None)

        p_info = res.get("promo") or {}
        amt = safe_float(p_info.get("amount", self.selected_promo.get("amount") if self.selected_promo else 0))

        success_embed = discord.Embed(
            title="🚫 Promo Code Revoked Successfully",
            description=f"Promo code **`{code}`** (**⚡ {amt:,.0f} BOLTs**) has been permanently invalidated.",
            color=0xEF4444
        )
        success_embed.add_field(name="Target Recipient", value=f"{self.target_user.mention} (`{self.target_user.id}`)", inline=True)
        success_embed.add_field(name="Revoked Code", value=f"```\n{code}\n```", inline=False)
        success_embed.add_field(name="Value", value=f"**⚡ {amt:,.2f} BOLTs**", inline=True)
        success_embed.add_field(name="Revoked By", value=f"{self.admin.mention}", inline=True)
        success_embed.add_field(name="Revocation Reason", value=f"`{reason}`", inline=True)
        success_embed.add_field(name="Timestamp", value=f"<t:{int(time.time())}:F>", inline=True)
        success_embed.set_footer(text="Vertex Admin Control Panel | Promo Code Invalidation")
        success_embed.timestamp = discord.utils.utcnow()

        if interaction.response.is_done():
            await interaction.followup.send(embed=success_embed, ephemeral=True)
        else:
            await interaction.response.edit_message(embed=success_embed, view=None)

        # Audit log
        log_embed = discord.Embed(
            title="🚫 [Audit Log] Bolt Promo Code Revoked",
            color=0xEF4444,
            timestamp=discord.utils.utcnow()
        )
        log_embed.add_field(name="Admin", value=f"{self.admin.mention} (`{self.admin.id}`)", inline=True)
        log_embed.add_field(name="Recipient", value=f"{self.target_user.mention} (`{self.target_user.id}`)", inline=True)
        log_embed.add_field(name="Code", value=f"`{code}`", inline=True)
        log_embed.add_field(name="Amount", value=f"**⚡ {amt:,.0f} BOLTs**", inline=True)
        log_embed.add_field(name="Reason", value=f"`{reason}`", inline=True)
        log_embed.set_footer(text="Vertex Admin Security & Audit Logger")
        await log_to_channel(log_embed)


@bot.tree.command(name="revoke_promo", description="Revoke an active promo code generated for a user (Admin Only)")
@discord.app_commands.describe(
    user="Optional target user to inspect promo codes for"
)
async def revoke_promo(
    interaction: discord.Interaction,
    user: Optional[Union[discord.Member, discord.User]] = None
):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied. This command is restricted to administrators.", ephemeral=True)

    flow = RevokePromoInteractiveFlow(admin=interaction.user, target_user=user)
    await flow.start(interaction)


# ─── Admin: /balance (Command Group) ──────────────────────────────────────────

balance_group = discord.app_commands.Group(name="balance", description="Manage user balances and credits (Admin Only)")

@balance_group.command(name="add", description="Add BOLTs / balance to a user account (Admin Only)")
@discord.app_commands.describe(
    user="The target user to grant balance to",
    amount="Amount of BOLTs to add",
    reason="Optional reason for the balance grant"
)
async def balance_add(
    interaction: discord.Interaction,
    user: Union[discord.Member, discord.User],
    amount: float,
    reason: Optional[str] = "Admin Credit Grant"
):
    await add_balance.callback(interaction, user=user, amount=amount, reason=reason)

@balance_group.command(name="deduct", description="Deduct BOLTs / balance from a user account (Admin Only)")
@discord.app_commands.describe(
    user="The target user to deduct balance from",
    amount="Amount of BOLTs to deduct",
    reason="Optional reason for the deduction"
)
async def balance_deduct(
    interaction: discord.Interaction,
    user: Union[discord.Member, discord.User],
    amount: float,
    reason: Optional[str] = "Admin Credit Deduction"
):
    await deduct_balance.callback(interaction, user=user, amount=amount, reason=reason)

@balance_group.command(name="set", description="Hard set a user's balance with safety warnings (Admin Only)")
@discord.app_commands.describe(
    user="The target user to overwrite balance for",
    amount="Target hard balance amount (BOLTs)",
    reason="Optional reason for the hard balance set"
)
async def balance_set(
    interaction: discord.Interaction,
    user: Union[discord.Member, discord.User],
    amount: float,
    reason: Optional[str] = "Staff Hard Ledger Override"
):
    await set_balance.callback(interaction, user=user, amount=amount, reason=reason)

bot.tree.add_command(balance_group)


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
