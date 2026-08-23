import discord
from discord.ext import commands
import panel_api


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

def format_date(dt_val, default: str = "N/A") -> str:
    if not dt_val:
        return default
    s = str(dt_val).strip()
    return s[:10] if len(s) >= 10 else (s or default)


class StatsView(discord.ui.View):
    """Persistent stats panel — survives bot restarts via custom_id."""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Analytics", style=discord.ButtonStyle.secondary, custom_id="stats_invites", emoji="📡")
    async def check_invites(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        stats = await panel_api.get_stats(str(interaction.user.id)) or {}

        joined = safe_int(stats.get('joined'))
        valid = safe_int(stats.get('valid'))
        left = safe_int(stats.get('left'))
        fake = safe_int(stats.get('fake'))

        embed = discord.Embed(color=0x6366F1)
        embed.set_author(
            name=f"{interaction.user.display_name} // NETWORK DATA",
            icon_url=interaction.user.display_avatar.url,
        )
        embed.add_field(name="RECRUITS",           value=f"```\n{joined}\n```", inline=True)
        embed.add_field(name="VERIFIED",           value=f"```\n{valid}\n```",  inline=True)
        embed.add_field(name="DEPARTED",           value=f"```\n{left}\n```",   inline=True)
        embed.add_field(name="ANOMALIES (FAKE)",   value=f"```\n{fake}\n```",   inline=False)
        embed.set_footer(text="VERTEX // ANALYTICS MODULE")
        await interaction.followup.send(embed=embed, ephemeral=True)

    @discord.ui.button(label="Activity", style=discord.ButtonStyle.secondary, custom_id="stats_activity", emoji="⚡")
    async def check_activity(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        stats = await panel_api.get_stats(str(interaction.user.id)) or {}

        messages = safe_int(stats.get('messages'))
        boosts = safe_int(stats.get('boosts'))

        embed = discord.Embed(color=0x3FFF75)
        embed.set_author(
            name=f"{interaction.user.display_name} // ACTIVITY LOG",
            icon_url=interaction.user.display_avatar.url,
        )
        embed.description = (
            f"**MESSAGES:**\n```\n{messages:,}\n```\n"
            f"**SERVER BOOSTS:**\n```\n{boosts}\n```"
        )
        embed.set_footer(text="VERTEX // MONITORING MODULE")
        await interaction.followup.send(embed=embed, ephemeral=True)

    @discord.ui.button(label="My Account & Servers", style=discord.ButtonStyle.primary, custom_id="stats_history", emoji="📜")
    async def check_history(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        data = await panel_api.get_user_history(str(interaction.user.id)) or {}

        if not data.get("ok"):
            embed = discord.Embed(
                title="⚠️ Discord Account Not Linked",
                description=(
                    "Your Discord account is not yet linked to a Vertex panel account.\n\n"
                    "**How to Link:**\n"
                    "1. Visit [Vertex Account Settings](https://dash.vertexnodes.top/account)\n"
                    "2. Click **Connect Discord** to link your Discord account\n"
                    "3. Once linked, you can view your balance, spending, and manage VPS instances right here!"
                ),
                color=0xEF4444
            )
            return await interaction.followup.send(embed=embed, ephemeral=True)

        u = data.get("user") or {}
        summary = data.get("summary") or {}
        servers = data.get("owned_servers") or []
        txs = data.get("spending_history") or []

        current_balance = safe_float(summary.get('current_balance', data.get('balance', 0.0)))
        total_spent = safe_float(summary.get('total_spent'))
        total_promo_claimed = safe_float(summary.get('total_promo_claimed'))

        embed = discord.Embed(
            title=f"⚡ {interaction.user.display_name} // Account & Cloud Servers",
            color=0x6366F1,
            description=f"**Current Balance:** `⚡ {current_balance:,.2f} BOLTs` | **Active Servers:** `{len(servers)}`"
        )
        embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url)

        embed.add_field(
            name="📊 Financial Overview",
            value=(
                f"• **Balance:** `{current_balance:,.2f} BOLTs`\n"
                f"• **Total Spent:** `-{total_spent:,.2f} BOLTs`\n"
                f"• **Promo Codes Claimed:** `+{total_promo_claimed:,.2f} BOLTs`"
            ),
            inline=True
        )

        embed.add_field(
            name="🖥️ Active VPS Instances",
            value=f"**{len(servers)} server{'s' if len(servers) != 1 else ''}** deployed on Vertex Cloud.",
            inline=True
        )

        if servers:
            s_lines = []
            for s in servers[:4]:
                s_name = safe_str(s.get('name') or 'VPS Instance')
                s_node = safe_str(s.get('node_name') or 'Node')
                s_status = safe_str(s.get('status', 'in_use')).capitalize()
                s_exp = format_date(s.get('expires_at'))
                s_lines.append(f"• **{s_name}** (`{s_node}`): {s_status} | Expires: `{s_exp}`")
            embed.add_field(name="Cloud Servers", value="\n".join(s_lines), inline=False)

        if txs:
            t_lines = []
            for t in txs[:5]:
                amt = safe_float(t.get("amount"))
                sign = "+" if amt > 0 else ""
                t_desc = safe_str(t.get('description') or t.get('type') or 'Credit adjustment')
                t_lines.append(f"• **{sign}{amt:,.2f} BOLTs** — {t_desc}")
            embed.add_field(name="Recent Transactions", value="\n".join(t_lines), inline=False)

        embed.set_footer(text="VERTEX // CLOUD & BILLING MODULE")
        await interaction.followup.send(embed=embed, ephemeral=True)


class Panel(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    def _is_admin(self, ctx: commands.Context) -> bool:
        admin_ids = [1276619530310778891]
        return ctx.author.id in admin_ids or ctx.author.guild_permissions.administrator

    @commands.command(name="spawnpanel")
    async def spawn_panel(self, ctx: commands.Context):
        if not self._is_admin(ctx):
            return await ctx.send("❌ Access Denied.", delete_after=5)

        embed = discord.Embed(
            title="Vertex Rewards Dashboard",
            description=(
                "Track your community activity and earn **BOLTS** to use in the Vertex Host ecosystem.\n\n"
                "**🎁 Invites:**\n"
                "• 15 verified invites → 3,000 BOLTS\n"
                "• 25 verified invites → 5,000 BOLTS\n\n"
                "**💬 Messages:**\n"
                "• 200 messages → 3,500 BOLTS\n"
                "• 300 messages → 5,000 BOLTS\n\n"
                "**🚀 Boosts:**\n"
                "• 1× Boost → 3,000 BOLTS\n"
                "• 2× Boosts → 5,000 BOLTS\n\n"
                "Use `/redeem <code>` to claim a Bolt redemption code."
            ),
            color=0x2B2D31,
        )
        if self.bot.user.avatar:
            embed.set_thumbnail(url=self.bot.user.avatar.url)
        embed.set_footer(text="Select a module below to check your stats")
        await ctx.send(embed=embed, view=StatsView())


async def setup(bot: commands.Bot):
    await bot.add_cog(Panel(bot))
