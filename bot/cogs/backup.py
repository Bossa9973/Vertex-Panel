"""
backup.py  —  Vertex Bot  —  Admin Backup Commands
===================================================
Slash command group: /backup

Subcommands:
  /backup vm        <server_id>                     — backup a single VM by ID
  /backup all       [tier: all|paid|free]           — backup every VM
  /backup node      <node_id> [tier: all|paid|free] — backup all VMs on a node
  /backup server    <ids: 1,2,5>                   — backup specific server IDs
  /backup nodes                                     — list all nodes and their IDs
  /backup set_tier  <server_id> <tier: paid|free>   — mark VM as Paid or Free tier

All subcommands require Administrator permission.
Files upload to Google Drive immediately after each Proxmox snapshot completes.
"""

import discord
from discord import app_commands
from discord.ext import commands

import panel_api

DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1wi6f02OkegTIlZDWUohgH4ohkhbDNbLK"
ACCENT  = 0x5865F2
SUCCESS = 0x57F287
WARNING = 0xFEE75C
DANGER  = 0xED4245


def _tier_label(tier: str) -> str:
    return {"all": "All tiers", "paid": "Paid tier only", "free": "Free tier only"}.get(tier, tier)


class Backup(commands.Cog):
    """Admin commands to trigger Proxmox VM backups to Google Drive and manage backup tiers."""

    backup_group = app_commands.Group(
        name="backup",
        description="Admin: trigger VM backups and push to Google Drive",
        default_permissions=discord.Permissions(administrator=True),
    )

    # /backup nodes
    @backup_group.command(name="nodes", description="List all Proxmox nodes and their IDs")
    async def backup_nodes(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        nodes = await panel_api.get_nodes()
        if not nodes:
            embed = discord.Embed(
                color=DANGER,
                title="No Nodes Found",
                description="Could not fetch nodes from the panel. Check PANEL_URL and BOT_API_SECRET.",
            )
            return await interaction.followup.send(embed=embed, ephemeral=True)
        lines = "\n".join(f"`#{n['id']}` - **{n['name']}**" for n in nodes)
        embed = discord.Embed(color=ACCENT, title="Proxmox Nodes", description=lines)
        embed.set_footer(text="Use /backup node node_id:<id> to backup a specific node")
        await interaction.followup.send(embed=embed, ephemeral=True)

    # /backup all
    @backup_group.command(name="all", description="Backup all VMs and upload to Google Drive")
    @app_commands.describe(tier="Which plan tier to target (default: all)")
    @app_commands.choices(tier=[
        app_commands.Choice(name="All servers (free + paid)", value="all"),
        app_commands.Choice(name="Paid tier only",            value="paid"),
        app_commands.Choice(name="Free tier only",            value="free"),
    ])
    async def backup_all(self, interaction: discord.Interaction, tier: str = "all") -> None:
        await interaction.response.defer(ephemeral=True)
        await self._send_working(interaction, f"Triggering backup for **all servers** ({_tier_label(tier)})...")
        result = await panel_api.trigger_backups(tier=tier, force=True)
        await self._send_result(interaction, result)

    # /backup node
    @backup_group.command(name="node", description="Backup all VMs on a specific Proxmox node")
    @app_commands.describe(
        node_id="Node ID - use /backup nodes to find it",
        tier="Filter by plan tier (default: all)",
    )
    @app_commands.choices(tier=[
        app_commands.Choice(name="All servers (free + paid)", value="all"),
        app_commands.Choice(name="Paid tier only",            value="paid"),
        app_commands.Choice(name="Free tier only",            value="free"),
    ])
    async def backup_node(self, interaction: discord.Interaction, node_id: int, tier: str = "all") -> None:
        await interaction.response.defer(ephemeral=True)
        await self._send_working(interaction, f"Triggering backup for node **#{node_id}** ({_tier_label(tier)})...")
        result = await panel_api.trigger_backups(node_id=node_id, tier=tier, force=True)
        await self._send_result(interaction, result)

    # /backup vm
    @backup_group.command(name="vm", description="Backup a single VM by its panel server ID")
    @app_commands.describe(server_id="Server ID to backup (e.g. 42)")
    async def backup_vm(self, interaction: discord.Interaction, server_id: int) -> None:
        await interaction.response.defer(ephemeral=True)
        if server_id <= 0:
            embed = discord.Embed(
                color=DANGER,
                title="Invalid Server ID",
                description="Please provide a valid positive integer server ID.",
            )
            return await interaction.followup.send(embed=embed, ephemeral=True)
        await self._send_working(interaction, f"Triggering instant backup for server **#{server_id}**...")
        result = await panel_api.trigger_backups(server_ids=[server_id], force=True)
        await self._send_result(interaction, result)

    # /backup server
    @backup_group.command(name="server", description="Backup specific servers by panel ID")
    @app_commands.describe(ids="Server ID(s), comma-separated: e.g. 42 or 1,2,5")
    async def backup_server(self, interaction: discord.Interaction, ids: str) -> None:
        await interaction.response.defer(ephemeral=True)
        server_ids = [int(p.strip()) for p in ids.split(",") if p.strip().isdigit() and int(p.strip()) > 0]
        if not server_ids:
            embed = discord.Embed(
                color=DANGER,
                title="Invalid IDs",
                description="No valid server IDs found. Use comma-separated integers e.g. `1,2,5`.",
            )
            return await interaction.followup.send(embed=embed, ephemeral=True)
        ids_display = ", ".join(f"`#{i}`" for i in server_ids)
        await self._send_working(interaction, f"Triggering backup for server(s): {ids_display}...")
        result = await panel_api.trigger_backups(server_ids=server_ids, force=True)
        await self._send_result(interaction, result)

    # /backup set_tier
    @backup_group.command(name="set_tier", description="Mark a server as Paid (hourly cloud backups) or Free (standard)")
    @app_commands.describe(
        server_id="Server ID (find it in Admin -> Servers)",
        tier="Choose Paid or Free",
    )
    @app_commands.choices(tier=[
        app_commands.Choice(name="Paid (Included in hourly cloud backups)", value="paid"),
        app_commands.Choice(name="Free (Standard / manual backups only)", value="free"),
    ])
    async def backup_set_tier(self, interaction: discord.Interaction, server_id: int, tier: str) -> None:
        await interaction.response.defer(ephemeral=True)
        result = await panel_api.set_server_tier(server_id, tier)
        if not result or result.get("ok") is False:
            err = result.get("error") or result.get("message") or "Unknown error updating server tier."
            embed = discord.Embed(color=DANGER, title="Tier Update Failed", description=err)
            return await interaction.followup.send(embed=embed, ephemeral=True)

        tier_badge = "💎 Paid Tier (Hourly Cloud Backups Active)" if tier == "paid" else "📦 Free Tier (Standard)"
        embed = discord.Embed(
            color=SUCCESS,
            title="✅ Server Plan Tier Updated",
            description=f"Server `#{server_id}` (**{result.get('name', 'Server')}**) has been marked as **{tier_badge}**.",
        )
        embed.set_footer(text="Paid servers are automatically backed up every hour at :00")
        await interaction.followup.send(embed=embed, ephemeral=True)

    async def _send_working(self, interaction: discord.Interaction, description: str) -> None:
        embed = discord.Embed(
            color=WARNING,
            title="Dispatching Backups...",
            description=description + "\n\nFiles upload to Google Drive the moment each snapshot finishes.",
        )
        await interaction.followup.send(embed=embed, ephemeral=True)

    async def _send_result(self, interaction: discord.Interaction, result: dict) -> None:
        if not result or result.get("ok") is False:
            err = result.get("error") or result.get("message") or "Unknown error - check panel logs."
            embed = discord.Embed(color=DANGER, title="Backup Trigger Failed", description=err)
            return await interaction.edit_original_response(embed=embed)
        dispatched = result.get("dispatched", 0)
        skipped    = result.get("skipped",    0)
        embed = discord.Embed(
            color=SUCCESS if dispatched > 0 else WARNING,
            title="Backup Triggered" if dispatched > 0 else "Nothing Dispatched",
            description=result.get("message", "Backup jobs dispatched."),
        )
        embed.add_field(name="Dispatched",   value=f"`{dispatched}`",                      inline=True)
        embed.add_field(name="Skipped",      value=f"`{skipped}`",                         inline=True)
        embed.add_field(name="Google Drive", value=f"[Open Folder]({DRIVE_FOLDER_URL})",   inline=True)
        embed.set_footer(text="Uploads happen immediately as each snapshot completes")
        await interaction.edit_original_response(embed=embed)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(Backup(bot))