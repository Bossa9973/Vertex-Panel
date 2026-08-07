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
