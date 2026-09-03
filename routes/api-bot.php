<?php

use Convoy\Http\Controllers\Bot\BotApiController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Discord Bot API Routes
|--------------------------------------------------------------------------
| All routes are protected by BotApiAuthenticate middleware.
| The bot must send:  Authorization: Bot <BOT_API_SECRET>
*/

// Stats tracking (high-frequency, called on every Discord event)
Route::post('/stats/message',  [BotApiController::class, 'trackMessage']);
Route::post('/stats/boost',    [BotApiController::class, 'trackBoost']);
Route::get('/stats/{discordId}', [BotApiController::class, 'getStats']);

// Invite tracking
Route::post('/invite/track',        [BotApiController::class, 'trackInvite']);
Route::post('/invite/track-bulk',   [BotApiController::class, 'trackInvitesBulk']);
Route::post('/invite/join',         [BotApiController::class, 'recordJoin']);
Route::post('/invite/leave',   [BotApiController::class, 'recordLeave']);

// Admin operations
Route::post('/admin/add-messages',   [BotApiController::class, 'adminAddMessages']);
Route::post('/admin/add-invites',    [BotApiController::class, 'adminAddInvites']);
Route::post('/admin/generate-code',  [BotApiController::class, 'generatePromoCode']);
Route::post('/admin/reset-user',     [BotApiController::class, 'adminResetUser']);
Route::post('/admin/reset-all',      [BotApiController::class, 'adminResetAll']);

// Balance Management
Route::post('/admin/balance/add',    [BotApiController::class, 'adminAddBalance']);
Route::post('/admin/balance/deduct', [BotApiController::class, 'adminDeductBalance']);
Route::post('/admin/balance/set',    [BotApiController::class, 'adminSetBalance']);

// Promo Code Revocation & User Promos
Route::post('/admin/promo/revoke',               [BotApiController::class, 'revokePromoCode']);
Route::get('/admin/user-promos/{discordId}',     [BotApiController::class, 'getUserPromoCodes']);
Route::post('/admin/user-promos',                [BotApiController::class, 'getUserPromoCodes']);

// Promo code redemption
Route::post('/promo/redeem',         [BotApiController::class, 'redeemPromoCode']);

// User history & tracking profile (for /userinfo and /add_bolts commands)
Route::post('/user-history',          [BotApiController::class, 'getUserHistory']);
Route::get('/user-history/{identifier}', [BotApiController::class, 'getUserHistory']);

// Transaction & reference ID lookup (for /userinfo transaction inspector and /txinfo command)
Route::post('/transaction',           [BotApiController::class, 'getTransactionDetails']);
Route::get('/transaction/{identifier}', [BotApiController::class, 'getTransactionDetails']);

// VM Deletion (for /vm-delete interactive workflow)
Route::post('/admin/delete-vm',       [BotApiController::class, 'deleteVm']);

// Pterodactyl deploy completion — panel calls this, bot sends a DM to the user
Route::post('/ptero-complete',             [BotApiController::class, 'pterodactylComplete']);

// Pterodactyl DM queue polling — bot reads pending DMs and marks them sent
Route::get('/ptero-dm-queue',              [BotApiController::class, 'pterodactylDmQueue']);
Route::post('/ptero-dm-queue/mark-sent',   [BotApiController::class, 'pterodactylDmMarkSent']);





// ── Bot-initiated safe server actions ──────────────────────────────────────
// Ownership is validated server-side: discord_id -> user -> server.user_id
Route::get('/server-state/{discordId}/{serverId}', [BotApiController::class, 'getServerState']);
Route::post('/server-action',  [BotApiController::class, 'performServerAction']);
Route::post('/server-rename',  [BotApiController::class, 'renameServer']);

// ── Proxmox Nodes & Backup Operations (for /backup slash commands) ──────────
Route::get('/nodes',               [BotApiController::class, 'getNodes']);
Route::post('/backup/trigger',     [BotApiController::class, 'triggerBackups']);
Route::post('/backup/set-tier',    [BotApiController::class, 'setServerTier']);

// ── Anti-Abuse Inspection, History & Remediation (for /listabuse, bot & AI support) ───
Route::get('/admin/abuse-list',        [BotApiController::class, 'getAbuseList']);
Route::post('/admin/abuse-remediate',  [BotApiController::class, 'remediateAbuse']);
Route::get('/admin/abusers',           [BotApiController::class, 'getAbusers']);
Route::post('/admin/user-suspend',     [BotApiController::class, 'suspendUser']);
Route::post('/admin/user-unsuspend',   [BotApiController::class, 'unsuspendUser']);


