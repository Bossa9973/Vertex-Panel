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
Route::post('/invite/track',   [BotApiController::class, 'trackInvite']);
Route::post('/invite/join',    [BotApiController::class, 'recordJoin']);
Route::post('/invite/leave',   [BotApiController::class, 'recordLeave']);

// Admin operations
Route::post('/admin/add-messages',   [BotApiController::class, 'adminAddMessages']);
Route::post('/admin/add-invites',    [BotApiController::class, 'adminAddInvites']);
Route::post('/admin/generate-code',  [BotApiController::class, 'generatePromoCode']);
Route::post('/admin/reset-user',     [BotApiController::class, 'adminResetUser']);
Route::post('/admin/reset-all',      [BotApiController::class, 'adminResetAll']);

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



