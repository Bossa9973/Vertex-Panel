import discord
from discord.ext import commands
import panel_api


class StatsView(discord.ui.View):
    """Persistent stats panel — survives bot restarts via custom_id."""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Analytics", style=discord.ButtonStyle.secondary, custom_id="stats_invites", emoji="📡")
    async def check_invites(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        stats = await panel_api.get_stats(str(interaction.user.id))

        embed = discord.Embed(color=0x6366F1)
        embed.set_author(
            name=f"{interaction.user.display_name} // NETWORK DATA",
            icon_url=interaction.user.display_avatar.url,
        )
        embed.add_field(name="RECRUITS",           value=f"```\n{stats['joined']}\n```", inline=True)
        embed.add_field(name="VERIFIED",           value=f"```\n{stats['valid']}\n```",  inline=True)
        embed.add_field(name="DEPARTED",           value=f"```\n{stats['left']}\n```",   inline=True)
        embed.add_field(name="ANOMALIES (FAKE)",   value=f"```\n{stats['fake']}\n```",   inline=False)
        embed.set_footer(text="VERTEX // ANALYTICS MODULE")
        await interaction.followup.send(embed=embed, ephemeral=True)

    @discord.ui.button(label="Activity", style=discord.ButtonStyle.secondary, custom_id="stats_activity", emoji="⚡")
    async def check_activity(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        stats = await panel_api.get_stats(str(interaction.user.id))

        embed = discord.Embed(color=0x3FFF75)
        embed.set_author(
            name=f"{interaction.user.display_name} // ACTIVITY LOG",
            icon_url=interaction.user.display_avatar.url,
        )
        embed.description = (
            f"**MESSAGES:**\n```\n{stats['messages']}\n```\n"
            f"**SERVER BOOSTS:**\n```\n{stats['boosts']}\n```"
        )
        embed.set_footer(text="VERTEX // MONITORING MODULE")
        await interaction.followup.send(embed=embed, ephemeral=True)

    @discord.ui.button(label="My Account & Servers", style=discord.ButtonStyle.primary, custom_id="stats_history", emoji="📜")
    async def check_history(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer(ephemeral=True)
        data = await panel_api.get_user_history(str(interaction.user.id))

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

        embed = discord.Embed(
            title=f"⚡ {interaction.user.display_name} // Account & Cloud Servers",
            color=0x6366F1,
            description=f"**Current Balance:** `⚡ {summary.get('current_balance', 0.0):,.2f} BOLTs` | **Active Servers:** `{len(servers)}`"
        )
        embed.set_author(name=interaction.user.display_name, icon_url=interaction.user.display_avatar.url)

        embed.add_field(
            name="📊 Financial Overview",
            value=(
                f"• **Balance:** `{summary.get('current_balance', 0.0):,.2f} BOLTs`\n"
                f"• **Total Spent:** `-{summary.get('total_spent', 0.0):,.2f} BOLTs`\n"
                f"• **Promo Codes Claimed:** `+{summary.get('total_promo_claimed', 0.0):,.2f} BOLTs`"
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
                s_lines.append(f"• **{s.get('name')}** (`{s.get('node_name')}`): {s.get('status', 'in_use').capitalize()} | Expires: `{s.get('expires_at', 'N/A')[:10]}`")
            embed.add_field(name="Cloud Servers", value="\n".join(s_lines), inline=False)

        if txs:
            t_lines = []
            for t in txs[:5]:
                sign = "+" if t.get("amount", 0) > 0 else ""
                t_lines.append(f"• **{sign}{t.get('amount', 0):,.2f} BOLTs** — {t.get('description', 'Credit adjustment')}")
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
                "• 15 verified invites → 3,500 BOLTS\n"
                "• 25 verified invites → 5,000 BOLTS\n\n"
                "**💬 Messages:**\n"
                "• 200 messages → 3,500 BOLTS\n"
                "• 300 messages → 5,000 BOLTS\n\n"
                "**🚀 Boosts:**\n"
                "• 1× Boost → 4,000 BOLTS\n"
                "• 2× Boosts → 5,500 BOLTS\n\n"
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
