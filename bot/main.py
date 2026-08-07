import discord
from discord.ext import commands
from discord.app_commands import AppCommandError, TransformerError
from typing import Union
import os
from dotenv import load_dotenv
import panel_api
from cogs.panel import StatsView

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
ADMIN_ROLE_ID = int(os.getenv("DISCORD_ADMIN_ROLE_ID", "1354830877149888744"))

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
        or any(r.id == ADMIN_ROLE_ID for r in interaction.user.roles)
    )

# ─── /help ────────────────────────────────────────────────────────────────────

@bot.tree.command(name="help", description="Show all available commands")
async def help_cmd(interaction: discord.Interaction):
    embed = discord.Embed(title="🚀 Vertex Helper | Command Center", color=0x5865F2)
    embed.add_field(
        name="🛡️ Admin Commands",
        value=(
            "`/add_invites @user amount` — Manually add invites\n"
            "`/add_messages @user amount` — Manually add messages\n"
            "`/add_bolts @user amount` — Generate a Bolt Redemption Code\n"
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
    else:
        embed = discord.Embed(
            title="❌ Redemption Error",
            description=result.get("error", "Your Discord account is not linked to a Vertex panel account. Please sign in at the panel and link your Discord first."),
            color=0xEF4444,
        )
        embed.set_footer(text="Vertex Panel | Account System")
        await interaction.followup.send(embed=embed, ephemeral=True)

# ─── Admin: /add_messages ─────────────────────────────────────────────────────

@bot.tree.command(name="add_messages", description="Add messages to a user (Admin Only)")
async def add_messages(interaction: discord.Interaction, user: Union[discord.Member, discord.User], amount: int):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied", ephemeral=True)
    try:
        await panel_api.admin_add_messages(str(user.id), amount)
        await interaction.response.send_message(f"✅ Added **{amount}** messages to {user.mention}.", ephemeral=True)
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
    except Exception as e:
        await interaction.response.send_message(f"❌ Error: {e}", ephemeral=True)

# ─── Admin: /add_bolts ────────────────────────────────────────────────────────

@bot.tree.command(name="add_bolts", description="Give a Bolt Redemption Code to a user (Admin Only)")
async def add_bolts(interaction: discord.Interaction, user: Union[discord.Member, discord.User], amount: int):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied", ephemeral=True)

    await interaction.response.defer(ephemeral=True)
    try:
        code = await panel_api.generate_promo_code(str(user.id), amount, str(interaction.user.id))

        embed = discord.Embed(
            title="⚡ You've Received Bolts!",
            description=f"An administrator has gifted you **{amount} Bolts**!",
            color=0xFACC15,
        )
        embed.add_field(name="Your Redemption Code", value=f"```\n{code}\n```", inline=False)
        embed.add_field(
            name="How to Claim",
            value=(
                "1. Join the [Vertex Panel](https://dash.vertexnodes.top/account)\n"
                "2. Link your Discord account in Account Settings\n"
                "3. Use the `/redeem` command here in Discord\n"
                "4. Or enter the code on the panel website\n\n"
                "🔗 https://dash.vertexnodes.top/account"
            ),
            inline=False,
        )
        embed.set_footer(text="This code is unique to your account and one-time use.")

        try:
            await user.send(embed=embed)
            await interaction.followup.send(f"✅ Code `{code}` generated and sent to {user.mention} via DM.", ephemeral=True)
        except Exception:
            await interaction.followup.send(
                f"⚠️ Code generated: `{code}` — but couldn't DM {user.mention} (DMs closed). Share it manually.",
                ephemeral=True,
            )
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {e}", ephemeral=True)

# ─── Admin: /reset_user_stats ─────────────────────────────────────────────────

@bot.tree.command(name="reset_user_stats", description="Reset stats for a specific user (Admin Only)")
async def reset_user_stats(interaction: discord.Interaction, user: Union[discord.Member, discord.User]):
    if not is_admin(interaction):
        return await interaction.response.send_message("❌ Access Denied.", ephemeral=True)
    try:
        await panel_api.admin_reset_user(str(user.id))
        await interaction.response.send_message(f"✅ Stats reset for {user.mention}.", ephemeral=True)
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
    except Exception as e:
        await interaction.followup.send(f"❌ Error: {e}", ephemeral=True)

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not TOKEN:
        print("ERROR: DISCORD_TOKEN is not set in bot/.env")
    else:
        bot.run(TOKEN)
