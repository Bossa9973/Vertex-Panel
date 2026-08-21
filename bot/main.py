import discord
from discord.ext import commands
from discord.app_commands import AppCommandError, TransformerError
from typing import Union, Optional
import os
import time
from dotenv import load_dotenv
import panel_api
from cogs.panel import StatsView

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
ADMIN_ROLE_ID = int(os.getenv("DISCORD_ADMIN_ROLE_ID", "1354830877149888744"))
LOG_CHANNEL_ID = os.getenv("DISCORD_LOG_CHANNEL_ID", "")

async def log_to_channel(embed: discord.Embed):
    """Sends an audit log embed to the configured logging channel if set."""
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
    tx = data.get("transaction") or {}
    u = data.get("user") or {}
    srv = data.get("server") or {}
    promo = data.get("promo") or {}
    lifecycle = data.get("lifecycle") or []

    ref_id = tx.get("reference_id") or f"TX#{tx.get('id')}"
    amt = float(tx.get("amount", 0.0))
    is_positive = amt > 0
    color = 0x10B981 if is_positive else (0x8B5CF6 if "RENEW" in ref_id else 0x3B82F6 if "DEPLOY" in ref_id else 0xF59E0B)

    embed = discord.Embed(
        title=f"🔍 Transaction Inspector // `{ref_id}`",
        description=f"**Action:** `{str(tx.get('type', 'transaction')).upper()}` — {tx.get('description') or 'System transaction'}",
        color=color,
    )

    sign = "+" if is_positive else ""
    date_str = tx.get("created_at", "N/A")[:19].replace("T", " ") if tx.get("created_at") else "N/A"
    ts = tx.get("timestamp")
    time_fmt = f"<t:{int(ts)}:F> (<t:{int(ts)}:R>)" if ts else f"`{date_str}`"

    embed.add_field(
        name="💳 Transaction Details",
        value=(
            f"• **Reference ID:** `{ref_id}`\n"
            f"• **Amount:** `⚡ {sign}{amt:,.2f} BOLTs`\n"
            f"• **Timestamp:** {time_fmt}\n"
            f"• **Type:** `{tx.get('type', 'N/A')}`"
        ),
        inline=False
    )

    if u:
        user_discord = f"<@{u.get('discord_id')}> (`{u.get('discord_id')}`)" if u.get("discord_id") else "Not Linked"
        embed.add_field(
            name="👤 Account Info",
            value=(
                f"• **User:** {u.get('name')} (Panel ID `#{u.get('id')}`)\n"
                f"• **Email:** `{u.get('email')}`\n"
                f"• **Discord:** {user_discord}\n"
                f"• **Current Balance:** `⚡ {u.get('credits', 0.0):,.2f} BOLTs` | **Role:** `{'Root Admin' if u.get('root_admin') else 'Client'}`"
            ),
            inline=False
        )

    if srv:
        exists = srv.get("server_exists", True)
        status_raw = str(srv.get("status") or "in_use").lower()
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

        specs_str = f"{srv.get('cpu_cores', 1)} vCPU | {srv.get('memory_mb', 0):,} MB RAM | {srv.get('disk_mb', 0):,} MB Storage"
        created_str = srv.get("server_created_at", "N/A")[:10] if srv.get("server_created_at") else "N/A"
        expires_str = srv.get("server_expires_at", "N/A")[:10] if srv.get("server_expires_at") else ("Expired / Deleted" if not exists else "Never")

        price_bought = srv.get("price_when_bought", 0.0)

        srv_val = (
            f"• **Server Name:** `{srv.get('name') or 'N/A'}`\n"
            f"• **Status:** {status_badge}\n"
            f"• **VMID & Hostname:** `{srv.get('vmid') or 'N/A'}` | `{srv.get('hostname') or 'N/A'}`\n"
            f"• **Node & Location:** `{srv.get('node_name') or 'Primary Node'}` (`{srv.get('node_ip') or srv.get('ip_address') or 'N/A'}`)\n"
            f"• **Plan & Specs:** **{srv.get('plan_name') or 'Cloud VPS'}** ({specs_str})\n"
            f"• **Price when Bought / Cost:** `⚡ {price_bought:,.2f} BOLTs`\n"
            f"• **Server Creation Date:** `{created_str}`\n"
            f"• **Server Expiry Date:** `{expires_str}`"
        )
        embed.add_field(name="🖥️ Linked Server Specifications & Lifecycle", value=srv_val, inline=False)

    if promo:
        p_status = "✅ Claimed" if promo.get("used") else "⏳ Unclaimed"
        admin_tag = f"<@{promo.get('created_by_discord_id')}>" if promo.get("created_by_discord_id") else "System"
        embed.add_field(
            name="🎁 Promo Code Info",
            value=(
                f"• **Code:** `{promo.get('code')}`\n"
                f"• **Value:** `⚡ {promo.get('amount', 0):,.2f} BOLTs` — {p_status}\n"
                f"• **Reason:** *{promo.get('reason') or 'Admin Gift'}*\n"
                f"• **Generated By:** {admin_tag} on `{str(promo.get('created_at', 'N/A'))[:10]}`"
            ),
            inline=False
        )

    if lifecycle:
        l_lines = []
        for l in lifecycle[:4]:
            ev = l.get("event")
            date_l = l.get("timestamp", "N/A")[:19].replace("T", " ") if l.get("timestamp") else "N/A"
            l_lines.append(f"• `{ev}` ({date_l}) — {l.get('description')}")
        embed.add_field(name="📜 Associated Audit Events", value="\n".join(l_lines), inline=False)

    embed.set_footer(text="Vertex Admin Control Panel | Transaction Audit Inspector")
    return embed


class UserInfoView(discord.ui.View):
    def __init__(self, admin_id: int, data: dict, target_label: str):
        super().__init__(timeout=300)
        self.admin_id = admin_id
        self.data = data
        self.target_label = target_label
        self.current_tab = "overview"

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.admin_id:
            await interaction.response.send_message("❌ This admin session belongs to another administrator.", ephemeral=True)
            return False
        return True

    def build_overview_embed(self) -> discord.Embed:
        d = self.data
        u = d.get("user") or {}
        disc = d.get("discord") or {}
        summary = d.get("summary") or {}
        disc_stats = disc.get("stats") or {}
        invites = disc.get("invites") or {}

        embed = discord.Embed(
            title=f"👤 Admin User Profile // {u.get('name') or self.target_label}",
            color=0x3B82F6,
            description="Overview of user account, current BOLT balance, and global platform statistics."
        )

        user_tag = f"<@{disc.get('discord_id')}>" if disc.get("discord_id") else "Not Linked"
        panel_status = f"✅ Linked (`ID #{u.get('id')}`)" if u.get("id") else "❌ No Panel Account"
        email_str = f"`{u.get('email')}`" if u.get("email") else "*None*"

        embed.add_field(name="Account Identity", value=f"**User:** {u.get('name') or 'N/A'}\n**Email:** {email_str}\n**Discord:** {user_tag}\n**Status:** {panel_status}", inline=True)
        embed.add_field(name="⚡ Current Balance", value=f"```\n{summary.get('current_balance', 0.0):,.2f} BOLTs\n```", inline=True)
        embed.add_field(name="🛡️ Role", value=f"**{'Root Admin' if u.get('root_admin') else 'Client'}**\nJoined: `{u.get('created_at', 'N/A')[:10] if u.get('created_at') else 'N/A'}`", inline=True)

        embed.add_field(
            name="📊 Financial Summary",
            value=(
                f"• **Total Deposited:** `+{summary.get('total_deposited', 0.0):,.2f} BOLTs`\n"
                f"• **Total Spent:** `-{summary.get('total_spent', 0.0):,.2f} BOLTs`\n"
                f"• **Total Bonuses:** `+{summary.get('total_bonus', 0.0):,.2f} BOLTs`\n"
                f"• **Promo Codes Claimed:** `+{summary.get('total_promo_claimed', 0.0):,.2f} BOLTs`\n"
                f"• **Total Transactions:** `{summary.get('total_transactions', 0)}`"
            ),
            inline=True
        )

        embed.add_field(
            name="🖥️ Server Summary",
            value=(
                f"• **Active VPS Count:** `{summary.get('active_servers', 0)}`\n"
                f"• **Lifetime Servers:** `{summary.get('total_servers_lifetime', 0)}`\n"
                f"• **Promo Codes Issued:** `{summary.get('total_promo_codes_issued', 0)}`"
            ),
            inline=True
        )

        embed.add_field(
            name="📡 Discord Community Stats",
            value=(
                f"• **Messages:** `{disc_stats.get('messages', 0):,}`\n"
                f"• **Server Boosts:** `{disc_stats.get('boosts', 0)}`\n"
                f"• **Valid Invites:** `{invites.get('valid', 0)}` (Total: `{invites.get('joined', 0)}`, Left: `{invites.get('left', 0)}`, Fake: `{invites.get('fake', 0)}`)"
            ),
            inline=False
        )

        embed.set_footer(text="Vertex Admin Control Panel | Use tabs below to navigate")
        return embed

    def build_spending_embed(self) -> discord.Embed:
        d = self.data
        summary = d.get("summary") or {}
        txs = d.get("spending_history") or []

        embed = discord.Embed(
            title=f"💳 Spending & Gains History // {self.target_label}",
            color=0x10B981,
            description=(
                f"**Total Spent:** `-{summary.get('total_spent', 0.0):,.2f} BOLTs` | "
                f"**Total Deposited:** `+{summary.get('total_deposited', 0.0):,.2f} BOLTs` | "
                f"**Balance:** `{summary.get('current_balance', 0.0):,.2f} BOLTs`\n"
                f"*Tip: Use the **🔍 Lookup Transaction** button below to inspect any transaction ID!*"
            )
        )

        if not txs:
            embed.add_field(name="Transactions", value="*No transaction records found for this user.*", inline=False)
        else:
            lines = []
            for tx in txs[:12]:
                amt = tx.get("amount", 0.0)
                sign = "+" if amt > 0 else ""
                amt_str = f"{sign}{amt:,.2f} BOLTs"
                date_str = tx.get("created_at", "")[:10] if tx.get("created_at") else "N/A"
                desc = tx.get("description") or tx.get("type") or "Credit adjustment"
                ref = f" (`{tx.get('reference_id')}`)" if tx.get("reference_id") else ""
                lines.append(f"• **{amt_str}** | `{date_str}` — {desc}{ref}")
            embed.add_field(name=f"Recent Transactions ({len(txs)} total)", value="\n".join(lines), inline=False)

        embed.set_footer(text="Vertex Admin Control Panel | Showing last 12 transactions")
        return embed

    def build_promos_embed(self) -> discord.Embed:
        d = self.data
        promos = d.get("promo_history") or []
        summary = d.get("summary") or {}

        embed = discord.Embed(
            title=f"🎁 Promo Codes & Admin Gifts // {self.target_label}",
            color=0xF59E0B,
            description=(
                f"**Total Promo Codes Issued:** `{summary.get('total_promo_codes_issued', 0)}` | "
                f"**Total Value:** `⚡ {summary.get('total_promo_generated', 0.0):,.2f} BOLTs` | "
                f"**Claimed Value:** `⚡ {summary.get('total_promo_claimed', 0.0):,.2f} BOLTs`"
            )
        )

        if not promos:
            embed.add_field(name="Promo History", value="*No promo codes issued to this user.*", inline=False)
        else:
            lines = []
            for p in promos[:10]:
                status = "✅ CLAIMED" if p.get("used") else "⏳ UNCLAIMED"
                admin_str = f"<@{p.get('created_by_discord_id')}>" if p.get("created_by_discord_id") else "System"
                date_str = p.get("created_at", "")[:10] if p.get("created_at") else "N/A"
                reason = p.get("reason") or "Admin Gift"
                lines.append(f"• `{p.get('code')}` (**{p.get('amount', 0):,.0f} BOLTs**) — {status}\n  └ Reason: *{reason}* | By: {admin_str} on `{date_str}`")
            embed.add_field(name=f"Issued Codes ({len(promos)} total)", value="\n\n".join(lines), inline=False)

        embed.set_footer(text="Vertex Admin Control Panel | Promo Code Tracking")
        return embed

    def build_servers_embed(self) -> discord.Embed:
        d = self.data
        servers = d.get("owned_servers") or []
        history = d.get("server_history") or []

        embed = discord.Embed(
            title=f"🖥️ Servers & Lifecycle History // {self.target_label}",
            color=0x8B5CF6,
            description=f"**Currently Active Servers:** `{len(servers)}` | **Recorded Lifecycle Events:** `{len(history)}`"
        )

        if not servers:
            embed.add_field(name="Active Servers", value="*User currently has no active VPS instances.*", inline=False)
        else:
            for srv in servers[:6]:
                status_raw = str(srv.get("status") or "in_use").lower()
                status_icon = "🟢 In Use" if status_raw in ["in_use", "running", "active"] else "🟡 Installing" if "install" in status_raw else "🔴 Suspended" if "suspend" in status_raw else "⚠️ Expired" if "expire" in status_raw else f"⚪ {status_raw.capitalize()}"
                expiry = srv.get("expires_at", "")[:10] if srv.get("expires_at") else "No Expiry"
                specs = f"{srv.get('cpu_cores', 1)} vCPU | {srv.get('memory_mb', 0):,} MB RAM | {srv.get('disk_mb', 0):,} MB Disk"
                val = (
                    f"**Status:** {status_icon} | **VMID:** `{srv.get('vmid')}`\n"
                    f"**Node:** `{srv.get('node_name')}` (`{srv.get('ip')}`)\n"
                    f"**Specs:** {specs}\n"
                    f"**Expires:** `{expiry}` | **Plan/OS:** {srv.get('description') or 'Standard VPS'}"
                )
                embed.add_field(name=f"🖥️ {srv.get('name')}", value=val, inline=False)

        if history:
            h_lines = []
            for h in history[:8]:
                badge = h.get("status_badge", "Event")
                icon = "🟢" if badge == "Deployed" else "🗑️" if badge == "Deleted" else "🔄" if badge == "Renewed" else "🔴" if badge == "Suspended" else "⚡"
                date_str = h.get("created_at", "")[:10] if h.get("created_at") else "N/A"
                h_lines.append(f"{icon} **{badge}** (`{date_str}`): {h.get('description')}")
            embed.add_field(name="📜 Recent Server Lifecycle Events", value="\n".join(h_lines), inline=False)

        embed.set_footer(text="Vertex Admin Control Panel | VPS & Hypervisor Tracker")
        return embed

    def build_discord_embed(self) -> discord.Embed:
        d = self.data
        disc = d.get("discord") or {}
        stats = disc.get("stats") or {}
        invites = disc.get("invites") or {}
        u = d.get("user") or {}

        embed = discord.Embed(
            title=f"📡 Discord & Community Activity // {self.target_label}",
            color=0x5865F2,
            description="Detailed breakdown of Discord chat messages, server boosts, and invite conversions."
        )

        user_tag = f"<@{disc.get('discord_id')}> (`{disc.get('discord_id')}`)" if disc.get("discord_id") else "Not Linked"
        embed.add_field(name="Discord Snowflake", value=user_tag, inline=False)

        embed.add_field(
            name="💬 Chat Activity",
            value=f"**Total Messages Tracked:**\n```\n{stats.get('messages', 0):,} messages\n```",
            inline=True
        )

        embed.add_field(
            name="🚀 Server Boosts",
            value=f"**Active Nitro Boosts:**\n```\n{stats.get('boosts', 0)} boosts\n```",
            inline=True
        )

        embed.add_field(
            name="🎁 Invite Conversions",
            value=(
                f"• **Valid Active Invites:** `{invites.get('valid', 0)}`\n"
                f"• **Total Joined:** `{invites.get('joined', 0)}`\n"
                f"• **Departed (Left):** `{invites.get('left', 0)}`\n"
                f"• **Fake / Anomalies:** `{invites.get('fake', 0)}`"
            ),
            inline=False
        )

        if u.get("id"):
            embed.add_field(
                name="🔗 Panel Sync Status",
                value=f"✅ Synced with Panel User ID `#{u.get('id')}` ({u.get('name')} | `{u.get('email')}`)",
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
        await interaction.response.edit_message(embed=self.build_overview_embed(), view=self)

    @discord.ui.button(label="Spending & Gains", style=discord.ButtonStyle.secondary, emoji="💳", row=0)
    async def btn_spending(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "spending"
        await interaction.response.edit_message(embed=self.build_spending_embed(), view=self)

    @discord.ui.button(label="Promo Codes", style=discord.ButtonStyle.secondary, emoji="🎁", row=0)
    async def btn_promos(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "promos"
        await interaction.response.edit_message(embed=self.build_promos_embed(), view=self)

    @discord.ui.button(label="Servers & History", style=discord.ButtonStyle.secondary, emoji="🖥️", row=0)
    async def btn_servers(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "servers"
        await interaction.response.edit_message(embed=self.build_servers_embed(), view=self)

    @discord.ui.button(label="Discord Stats", style=discord.ButtonStyle.secondary, emoji="📡", row=0)
    async def btn_discord(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_tab = "discord"
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
        d = self.data
        u = d.get("user") or {}
        summary = d.get("summary") or {}
        promos = d.get("promo_history") or []

        embed = discord.Embed(
            title=f"⚡ Gift Bolts Promo Code // Step 1: User History Preview",
            description=f"Review **{self.target_user.mention}**'s previous earn history from admin promo codes before proceeding.",
            color=0xFACC15
        )

        user_info_str = f"**User:** {u.get('name') or self.target_user.name}\n**Email:** `{u.get('email') or 'Not Linked'}`\n**Current Balance:** `⚡ {summary.get('current_balance', 0.0):,.2f} BOLTs`"
        embed.add_field(name="Recipient Profile", value=user_info_str, inline=False)

        if not promos:
            embed.add_field(name="Previous Admin Promo Gifts", value="*This user has never received an admin promo code before.*", inline=False)
        else:
            p_lines = []
            for p in promos[:6]:
                status = "✅ Claimed" if p.get("used") else "⏳ Unclaimed"
                admin_str = f"<@{p.get('created_by_discord_id')}>" if p.get("created_by_discord_id") else "Admin"
                date_str = p.get("created_at", "")[:10] if p.get("created_at") else "N/A"
                p_lines.append(f"• `{p.get('code')}` (**{p.get('amount', 0):,.0f} BOLTs**) — {status}\n  └ *{p.get('reason') or 'Admin Gift'}* by {admin_str} on `{date_str}`")
            embed.add_field(
                name=f"Past Promo Codes ({len(promos)} total | {summary.get('total_promo_generated', 0.0):,.0f} BOLTs issued)",
                value="\n".join(p_lines),
                inline=False
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
