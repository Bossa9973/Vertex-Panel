import discord
from discord.ext import commands
import datetime
import panel_api

# Channels to ignore for message counting (e.g. bot-spam, announcements)
IGNORED_CHANNEL_IDS = {
    int(x.strip())
    for x in __import__('os').getenv("IGNORED_CHANNEL_IDS", "1502564847597125643").split(",")
    if x.strip().isdigit()
}

# Set to your showcase channel ID in .env, e.g. SHOWCASE_CHANNEL_ID=123456789
SHOWCASE_CHANNEL_ID = int(__import__('os').getenv("SHOWCASE_CHANNEL_ID", "0"))


class Tracker(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        # guild_id → { invite_code: uses }
        self.invites: dict[int, dict[str, int]] = {}

    # ── Invite cache: populate on ready ────────────────────────────────────────

    @commands.Cog.listener()
    async def on_ready(self):
        for guild in self.bot.guilds:
            await self._cache_guild_invites(guild)

    async def _cache_guild_invites(self, guild: discord.Guild):
        try:
            invites = await guild.invites()
            self.invites[guild.id] = {inv.code: inv.uses for inv in invites}
            # Persist all invite codes to panel DB
            for inv in invites:
                if inv.inviter:  # vanity invites have no inviter
                    await panel_api.track_invite_create(inv.code, str(inv.inviter.id))
            print(f"[tracker] Cached {len(invites)} invites for {guild.name}")
        except discord.Forbidden:
            print(f"[tracker] Missing Manage Guild permission in {guild.name} — invite tracking disabled.")
        except Exception as e:
            print(f"[tracker] Failed to cache invites for {guild.name}: {e}")

    # ── Invite events ──────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_invite_create(self, invite: discord.Invite):
        if invite.guild.id not in self.invites:
            self.invites[invite.guild.id] = {}
        self.invites[invite.guild.id][invite.code] = invite.uses or 0
        if invite.inviter:
            await panel_api.track_invite_create(invite.code, str(invite.inviter.id))

    @commands.Cog.listener()
    async def on_invite_delete(self, invite: discord.Invite):
        guild_invites = self.invites.get(invite.guild.id, {})
        guild_invites.pop(invite.code, None)

    # ── Member join — detect which invite was used ─────────────────────────────

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        guild = member.guild
        used_invite = None

        try:
            new_invites = await guild.invites()
            old_invites = self.invites.get(guild.id, {})

            for inv in new_invites:
                old_uses = old_invites.get(inv.code, 0)
                if inv.uses > old_uses:
                    used_invite = inv
                    break

            # Update cache regardless
            self.invites[guild.id] = {inv.code: inv.uses for inv in new_invites}

        except discord.Forbidden:
            pass  # Can't track invites without Manage Guild
        except Exception as e:
            print(f"[tracker] on_member_join invite check failed: {e}")

        if used_invite and used_invite.inviter:
            account_age = datetime.datetime.now(datetime.timezone.utc) - member.created_at
            is_fake = account_age.days < 90  # accounts < 90 days old = suspect
            await panel_api.add_invited_user(
                discord_id=str(member.id),
                inviter_id=str(used_invite.inviter.id),
                is_fake=is_fake,
            )
            print(f"[tracker] {member} joined via {used_invite.inviter} (fake={is_fake})")

    # ── Member leave ───────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member):
        await panel_api.update_invited_user_status(str(member.id), "left")

    # ── Message counting ───────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot:
            return
        if message.channel.id in IGNORED_CHANNEL_IDS:
            return

        await panel_api.add_message(str(message.author.id))

        # Showcase channel detection
        if SHOWCASE_CHANNEL_ID and message.channel.id == SHOWCASE_CHANNEL_ID:
            # We don't track showcase separately anymore — just count messages
            pass

    # ── Boost tracking ────────────────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_member_update(self, before: discord.Member, after: discord.Member):
        # Fires when a member starts boosting (premium_since goes from None → datetime)
        if before.premium_since is None and after.premium_since is not None:
            await panel_api.add_boost(str(after.id))
            print(f"[tracker] {after} boosted the server.")


async def setup(bot: commands.Bot):
    await bot.add_cog(Tracker(bot))
