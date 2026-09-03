"""
abuse.py — Vertex Bot — Anti-Abuse Audit & Remediation
======================================================
Slash command: /listabuse [channel]

Features:
- Scans panel API for users with duplicate claim milestones (e.g. 15 and 25 invites)
  or duplicate staff promo + dashboard claims.
- Shows current balance vs legitimate balance and active servers.
- Interactive remediation: directly wipes all VPS instances from Proxmox VE and the panel DB,
  and resets balance to the highest legitimate reward (adding legitimate boosts).
- Optional publication of the audit report to a selected staff channel.
"""

from typing import Optional
import discord
from discord import app_commands
from discord.ext import commands

import panel_api

ACCENT  = 0x5865F2
SUCCESS = 0x57F287
WARNING = 0xFEE75C
DANGER  = 0xED4245


def format_report_embed(abusers: list, title_prefix: str = "") -> discord.Embed:
    """Format the abuse audit report embed."""
    total_abusers = len(abusers)
    total_excess = sum(a.get("excess_balance", 0) for a in abusers)
    total_servers = sum(a.get("active_servers_count", 0) for a in abusers)

    embed = discord.Embed(
        title=f"{title_prefix}🚨 Reward Abuse & Duplicate Claim Audit",
        color=DANGER,
        description=(
            f"**{total_abusers}** abusive account(s) detected.\n"
            f"• **Total Excess Claimed:** `{total_excess:,.0f} BOLTs`\n"
            f"• **Active VPS Instances Affected:** `{total_servers}`\n"
            f"• **Policy:** Claiming lower tiers resets counters. Stacking or promo duplicates violate limits."
        ),
    )

    for idx, a in enumerate(abusers[:12], start=1):
        disc_mention = f"<@{a['discord_id']}>" if a.get("discord_id") else f"`{a['name']}`"
        reasons_str = "\n".join(f"  • {r}" for r in a.get("reasons", []))
        balance_info = (
            f"Balance: `{a['current_balance']:,.0f}` ➔ **Reset Target: `{a['legitimate_balance']:,.0f}` BOLTs** "
            f"(`-{a['excess_balance']:,.0f}` excess)"
        )
        servers_info = f"VPS Servers: `{a['active_servers_count']}` active"

        embed.add_field(
            name=f"#{idx} {a.get('name', 'User')} ({disc_mention})",
            value=f"{reasons_str}\n{balance_info}\n{servers_info}",
            inline=False,
        )

    if total_abusers > 12:
        embed.set_footer(text=f"Showing top 12 of {total_abusers} flagged accounts.")
    else:
        embed.set_footer(text="Use the interactive controls below to remediate and wipe instances.")

    return embed


class RemediationConfirmView(discord.ui.View):
    """Confirmation view to execute instant wipe and balance reset."""

    def __init__(
        self,
        abuser: dict,
        admin: discord.User | discord.Member,
        target_channel: Optional[discord.TextChannel] = None,
    ):
        super().__init__(timeout=180)
        self.abuser = abuser
        self.admin = admin
        self.target_channel = target_channel

    @discord.ui.button(label="⚡ Wipe VPS & Restore Balance", style=discord.ButtonStyle.danger, emoji="💥")
    async def confirm_remediation(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._execute(interaction, suspend_days=0)

    @discord.ui.button(label="⛔ Wipe, Restore & Suspend (14d)", style=discord.ButtonStyle.danger, emoji="🔒")
    async def confirm_remediation_suspend(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._execute(interaction, suspend_days=14)

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary)
    async def cancel_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.stop()
        await interaction.response.send_message("Remediation cancelled.", ephemeral=True)

    async def _execute(self, interaction: discord.Interaction, suspend_days: int = 0):
        if interaction.user.id != self.admin.id:
            return await interaction.response.send_message("Only the command admin can confirm.", ephemeral=True)

        await interaction.response.defer(ephemeral=True)
        self.stop()

        res = await panel_api.remediate_abuse(
            admin_discord_id=str(self.admin.id),
            user_id=self.abuser.get("user_id"),
            discord_id=self.abuser.get("discord_id"),
            wipe_servers=True,
            suspend_days=suspend_days,
            reasons=self.abuser.get("reasons", []),
        )

        if not res.get("ok"):
            err = res.get("error") or "Unknown remediation error."
            fail_embed = discord.Embed(
                title="❌ Remediation Failed",
                description=f"Could not remediate user: `{err}`",
                color=DANGER,
            )
            return await interaction.followup.send(embed=fail_embed, ephemeral=True)

        servers_wiped = res.get("servers_wiped", 0)
        old_bal = res.get("old_balance", 0)
        new_bal = res.get("new_balance", 0)
        susp_text = f"• **Account Suspended:** `Yes (14 Days)` — cannot claim rewards or deploy VPS\n" if suspend_days > 0 else ""

        success_embed = discord.Embed(
            title="🛡️ Abuse Remediation Complete",
            color=SUCCESS,
            description=(
                f"Successfully remediated **{self.abuser.get('name')}** "
                f"(<@{self.abuser.get('discord_id')}>):\n\n"
                f"• **VPS Instances Wiped:** `{servers_wiped}` (Purged from Proxmox & DB)\n"
                f"• **Balance Restored:** `{old_bal:,.2f}` ➔ **`{new_bal:,.2f}` BOLTs** (highest earned reward)\n"
                f"{susp_text}"
                f"• **Duplicate Claims:** Cleaned & synchronized to highest reward tier\n"
                f"• **Admin:** <@{self.admin.id}>"
            ),
        )
        success_embed.set_footer(text="Logged to abuser_records and activity_log audit.")

        await interaction.followup.send(embed=success_embed, ephemeral=True)

        # Post certificate to target channel if designated
        if self.target_channel:
            try:
                await self.target_channel.send(embed=success_embed)
            except Exception as e:
                print(f"[abuse] Failed to post remediation cert to channel: {e}")


class AbuserSelect(discord.ui.Select):
    """Dropdown to select an abusive user for remediation."""

    def __init__(
        self,
        abusers: list,
        admin: discord.User | discord.Member,
        target_channel: Optional[discord.TextChannel] = None,
    ):
        self.abusers_map = {str(a["user_id"]): a for a in abusers}
        self.admin = admin
        self.target_channel = target_channel

        options = []
        for a in abusers[:25]:
            label = f"{a.get('name', 'User')} (ID #{a['user_id']})"[:100]
            desc = f"Cur: {a['current_balance']:,.0f} -> Legit: {a['legitimate_balance']:,.0f} | {a['active_servers_count']} VPS"[:100]
            options.append(discord.SelectOption(
                label=label,
                value=str(a["user_id"]),
                description=desc,
                emoji="⚠️",
            ))

        super().__init__(
            placeholder="Select an abuser to inspect and remediate...",
            min_values=1,
            max_values=1,
            options=options,
        )

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        if interaction.user.id != self.admin.id:
            return await interaction.followup.send("Only the command admin can take action.", ephemeral=True)

        selected_id = self.values[0]
        abuser = self.abusers_map.get(selected_id)
        if not abuser:
            return await interaction.followup.send("User record not found.", ephemeral=True)

        reasons = "\n".join(f"• {r}" for r in abuser.get("reasons", []))
        confirm_embed = discord.Embed(
            title=f"⚠️ Inspect & Remediate: {abuser.get('name')}",
            color=WARNING,
            description=(
                f"**User:** <@{abuser.get('discord_id')}> (`{abuser.get('email')}`)\n\n"
                f"**Detected Violations:**\n{reasons}\n\n"
                f"**Remediation Policy:**\n"
                f"1. 💣 **Wipe all `{abuser.get('active_servers_count')}` active VPS instances** "
                f"immediately from Proxmox VE and delete from panel database.\n"
                f"2. ⚖️ **Restore Balance** from `{abuser.get('current_balance'):,.2f}` ➔ "
                f"**`{abuser.get('legitimate_balance'):,.2f}` BOLTs** (highest claimed reward, capped at 8k).\n"
                f"3. 🧹 **Prune duplicate claims** in the database.\n"
                f"4. ⛔ **Optionally suspend user account** from earning or deploying servers.\n\n"
                f"Choose a remediation action below:"
            ),
        )

        view = RemediationConfirmView(abuser=abuser, admin=self.admin, target_channel=self.target_channel)
        await interaction.followup.send(embed=confirm_embed, view=view, ephemeral=True)


class AbuseAuditView(discord.ui.View):
    """Main interactive view for /listabuse."""

    def __init__(
        self,
        abusers: list,
        admin: discord.User | discord.Member,
        target_channel: Optional[discord.TextChannel] = None,
    ):
        super().__init__(timeout=300)
        self.abusers = abusers
        self.admin = admin
        self.target_channel = target_channel

        if abusers:
            self.add_item(AbuserSelect(abusers=abusers, admin=admin, target_channel=target_channel))

    @discord.ui.button(label="📢 Publish Report to Current Channel", style=discord.ButtonStyle.primary, emoji="📢")
    async def publish_report(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user.id != self.admin.id:
            return await interaction.response.send_message("Only the command admin can publish.", ephemeral=True)

        embed = format_report_embed(self.abusers, title_prefix="[PUBLISHED AUDIT] ")
        try:
            target = self.target_channel or interaction.channel
            await target.send(embed=embed)
            button.disabled = True
            await interaction.response.edit_message(view=self)
            await interaction.followup.send(f"✅ Audit report published to {target.mention}!", ephemeral=True)
        except Exception as e:
            await interaction.response.send_message(f"Failed to post to channel: {e}", ephemeral=True)


class Abuse(commands.Cog):
    """Admin commands to inspect and remediate reward claim abusers."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(
        name="listabuse",
        description="Admin: List users who abused reward claims and optionally wipe instances & reset balance",
    )
    @app_commands.describe(
        channel="Optional text channel to publish the audit report into",
    )
    @app_commands.default_permissions(administrator=True)
    async def listabuse(
        self,
        interaction: discord.Interaction,
        channel: Optional[discord.TextChannel] = None,
    ) -> None:
        await self._handle_listabuse(interaction, channel)

    @app_commands.command(
        name="listabusers",
        description="Admin: List users who abused reward claims (alias for /listabuse)",
    )
    @app_commands.describe(
        channel="Optional text channel to publish the audit report into",
    )
    @app_commands.default_permissions(administrator=True)
    async def listabusers(
        self,
        interaction: discord.Interaction,
        channel: Optional[discord.TextChannel] = None,
    ) -> None:
        await self._handle_listabuse(interaction, channel)

    async def _handle_listabuse(
        self,
        interaction: discord.Interaction,
        channel: Optional[discord.TextChannel] = None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)

        res = await panel_api.get_abuse_list()
        if not res or res.get("ok") is False:
            err = res.get("error") if res else "Unknown error contacting panel."
            fail_embed = discord.Embed(
                title="❌ Abuse Check Failed",
                description=f"Could not retrieve abuse list: `{err}`",
                color=DANGER,
            )
            return await interaction.followup.send(embed=fail_embed, ephemeral=True)

        abusers = res.get("abusers", [])

        if not abusers:
            clean_embed = discord.Embed(
                title="✅ No Abuse Detected",
                description=(
                    "All user claims and balances are compliant.\n"
                    "No duplicate milestone claims or staff promo collisions found."
                ),
                color=SUCCESS,
            )
            return await interaction.followup.send(embed=clean_embed, ephemeral=True)

        report_embed = format_report_embed(abusers)

        # If a channel was designated as argument, publish immediately
        published_msg = ""
        if channel:
            try:
                pub_embed = format_report_embed(abusers, title_prefix="[STAFF AUDIT] ")
                await channel.send(embed=pub_embed)
                published_msg = f"\n\n📢 *Audit report automatically published to {channel.mention}.*"
            except Exception as e:
                published_msg = f"\n\n⚠️ *Could not post to {channel.mention}: {e}*"

        view = AbuseAuditView(abusers=abusers, admin=interaction.user, target_channel=channel)
        await interaction.followup.send(
            content=f"Found **{len(abusers)}** user(s) with policy violations.{published_msg}",
            embed=report_embed,
            view=view,
            ephemeral=True,
        )

    @app_commands.command(
        name="suspend",
        description="Admin: Suspend a user from claiming rewards and deploying VPS servers",
    )
    @app_commands.describe(
        user="Discord user to suspend",
        days="Duration of suspension in days (default: 14)",
        reason="Reason for suspension",
    )
    @app_commands.default_permissions(administrator=True)
    async def suspend_cmd(
        self,
        interaction: discord.Interaction,
        user: discord.User,
        days: int = 14,
        reason: str = "Reward abuse and policy violation",
    ) -> None:
        await interaction.response.defer(ephemeral=True)

        res = await panel_api.suspend_user(
            admin_discord_id=str(interaction.user.id),
            discord_id=str(user.id),
            days=days,
            reason=reason,
        )

        if not res.get("ok"):
            err = res.get("error") or "Unknown error contacting panel."
            return await interaction.followup.send(f"❌ Failed to suspend user: `{err}`", ephemeral=True)

        until = res.get("suspended_until", f"{days} days")
        embed = discord.Embed(
            title="🔒 User Suspended",
            color=DANGER,
            description=(
                f"**User:** {user.mention} (`{user.id}`)\n"
                f"**Suspended Until:** `{until}` ({days} days)\n"
                f"**Reason:** {reason}\n"
                f"**Enforcement:** Blocked from claiming BOLTs and deploying new VPS instances.\n"
                f"**Admin:** {interaction.user.mention}"
            ),
        )
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(
        name="unsuspend",
        description="Admin: Remove suspension from a user account",
    )
    @app_commands.describe(
        user="Discord user to unsuspend",
    )
    @app_commands.default_permissions(administrator=True)
    async def unsuspend_cmd(
        self,
        interaction: discord.Interaction,
        user: discord.User,
    ) -> None:
        await interaction.response.defer(ephemeral=True)

        res = await panel_api.unsuspend_user(
            admin_discord_id=str(interaction.user.id),
            discord_id=str(user.id),
        )

        if not res.get("ok"):
            err = res.get("error") or "Unknown error contacting panel."
            return await interaction.followup.send(f"❌ Failed to unsuspend user: `{err}`", ephemeral=True)

        embed = discord.Embed(
            title="🔓 User Unsuspended",
            color=SUCCESS,
            description=(
                f"**User:** {user.mention} (`{user.id}`)\n"
                f"**Status:** Suspension lifted. User can now claim eligible rewards and deploy servers.\n"
                f"**Admin:** {interaction.user.mention}"
            ),
        )
        await interaction.followup.send(embed=embed, ephemeral=True)

    @app_commands.command(
        name="abusers",
        description="Admin: View recorded abusers, history, and suspension status",
    )
    @app_commands.describe(
        user="Optional user to filter",
    )
    @app_commands.default_permissions(administrator=True)
    async def abusers_cmd(
        self,
        interaction: discord.Interaction,
        user: Optional[discord.User] = None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)

        discord_id = str(user.id) if user else None
        res = await panel_api.get_abusers(discord_id=discord_id)

        if not res.get("ok"):
            err = res.get("error") or "Unknown error contacting panel."
            return await interaction.followup.send(f"❌ Failed to fetch abuser history: `{err}`", ephemeral=True)

        abusers = res.get("abusers", [])
        if not abusers:
            return await interaction.followup.send("✅ No recorded abuser records found.", ephemeral=True)

        embed = discord.Embed(
            title="📋 Abuser Records & History",
            color=WARNING,
            description=f"Showing **{len(abusers)}** abuser record(s):",
        )

        for a in abusers[:10]:
            susp = f"🔒 Suspended until `{a.get('suspended_until')}`" if a.get("is_suspended") else "🟢 Active"
            reasons = ", ".join(a.get("reasons", []))[:100]
            embed.add_field(
                name=f"{a.get('username')} (<@{a.get('discord_id')}>)",
                value=(
                    f"**Status:** `{a.get('status')}` | {susp}\n"
                    f"**Balance:** `{a.get('old_balance'):,.0f}` ➔ `{a.get('new_balance'):,.0f}` BOLTs\n"
                    f"**Servers Wiped:** `{a.get('servers_wiped')}`\n"
                    f"**Reasons:** *{reasons}*"
                ),
                inline=False,
            )

        await interaction.followup.send(embed=embed, ephemeral=True)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Abuse(bot))
