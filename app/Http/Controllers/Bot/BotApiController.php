<?php

namespace Convoy\Http\Controllers\Bot;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BotApiController extends Controller
{
    // =========================================================================
    // STATS — called on every Discord event
    // =========================================================================

    /**
     * Increment the message counter for a Discord user.
     * POST /api/bot/stats/message   { discord_id }
     */
    public function trackMessage(Request $request): JsonResponse
    {
        $request->validate(['discord_id' => 'required|string|max:32']);
        $this->incrementStat($request->input('discord_id'), 'messages', 1);

        return response()->json(['ok' => true]);
    }

    /**
     * Increment the boost counter for a Discord user.
     * POST /api/bot/stats/boost   { discord_id }
     */
    public function trackBoost(Request $request): JsonResponse
    {
        $request->validate(['discord_id' => 'required|string|max:32']);
        $this->incrementStat($request->input('discord_id'), 'boosts', 1);

        return response()->json(['ok' => true]);
    }

    /**
     * Store a new invite code.
     * POST /api/bot/invite/track   { code, inviter_discord_id }
     */
    public function trackInvite(Request $request): JsonResponse
    {
        $request->validate([
            'code'               => 'required|string|max:32',
            'inviter_discord_id' => 'required|string|max:32',
        ]);

        DB::table('discord_invites')->updateOrInsert(
            ['code' => $request->input('code')],
            ['inviter_discord_id' => $request->input('inviter_discord_id')]
        );

        return response()->json(['ok' => true]);
    }

    /**
     * Record that a member joined via a specific inviter.
     * POST /api/bot/invite/join   { discord_id, inviter_discord_id, is_fake }
     */
    public function recordJoin(Request $request): JsonResponse
    {
        $request->validate([
            'discord_id'         => 'required|string|max:32',
            'inviter_discord_id' => 'required|string|max:32',
            'is_fake'            => 'boolean',
        ]);

        DB::table('discord_invited_users')->updateOrInsert(
            ['discord_id' => $request->input('discord_id')],
            [
                'inviter_discord_id' => $request->input('inviter_discord_id'),
                'is_fake'            => $request->boolean('is_fake', false),
                'status'             => 'joined',
                'created_at'         => now(),
            ]
        );

        return response()->json(['ok' => true]);
    }

    /**
     * Mark a member as having left.
     * POST /api/bot/invite/leave   { discord_id }
     */
    public function recordLeave(Request $request): JsonResponse
    {
        $request->validate(['discord_id' => 'required|string|max:32']);

        DB::table('discord_invited_users')
            ->where('discord_id', $request->input('discord_id'))
            ->update(['status' => 'left']);

        return response()->json(['ok' => true]);
    }

    /**
     * Get full aggregated stats for a Discord user.
     * GET /api/bot/stats/{discord_id}
     */
    public function getStats(Request $request, string $discordId): JsonResponse
    {
        $stats = DB::table('discord_stats')
            ->where('discord_id', $discordId)
            ->first();

        $invited = DB::table('discord_invited_users')
            ->where('inviter_discord_id', $discordId)
            ->get();

        $joined = $invited->count();
        $left   = $invited->where('status', 'left')->count();
        $fake   = $invited->where('is_fake', true)->count();
        $valid  = $invited->where('status', 'joined')->where('is_fake', false)->count();

        return response()->json([
            'discord_id' => $discordId,
            'messages'   => (int) ($stats?->messages ?? 0),
            'boosts'     => (int) ($stats?->boosts ?? 0),
            'joined'     => $joined,
            'left'       => $left,
            'fake'       => $fake,
            'valid'      => $valid,
        ]);
    }

    // =========================================================================
    // ADMIN — protected by the same bot secret
    // =========================================================================

    /**
     * Admin: add N messages to a user.
     * POST /api/bot/admin/add-messages   { discord_id, amount }
     */
    public function adminAddMessages(Request $request): JsonResponse
    {
        $request->validate([
            'discord_id' => 'required|string|max:32',
            'amount'     => 'required|integer|min:1',
        ]);

        $this->incrementStat($request->input('discord_id'), 'messages', (int) $request->input('amount'));

        return response()->json(['ok' => true]);
    }

    /**
     * Admin: add N valid invites to a user.
     * POST /api/bot/admin/add-invites   { discord_id, amount }
     */
    public function adminAddInvites(Request $request): JsonResponse
    {
        $request->validate([
            'discord_id' => 'required|string|max:32',
            'amount'     => 'required|integer|min:1',
        ]);

        $inviterId = $request->input('discord_id');
        $amount    = (int) $request->input('amount');

        for ($i = 0; $i < $amount; $i++) {
            DB::table('discord_invited_users')->insert([
                'discord_id'         => 'ADMIN-' . Str::random(16),
                'inviter_discord_id' => $inviterId,
                'is_fake'            => false,
                'status'             => 'joined',
                'created_at'         => now(),
            ]);
        }

        return response()->json(['ok' => true, 'added' => $amount]);
    }

    /**
     * Admin: generate a promo code for a Discord user.
     * POST /api/bot/admin/generate-code   { discord_id, amount, admin_discord_id, reason }
     * Returns: { code }
     */
    public function generatePromoCode(Request $request): JsonResponse
    {
        $request->validate([
            'discord_id'       => 'required|string|max:32',
            'amount'           => 'required|numeric|min:1',
            'admin_discord_id' => 'required|string|max:32',
            'reason'           => 'nullable|string|max:255',
        ]);

        $this->ensureTablesExist();

        $code = 'LMN-'
            . strtoupper(Str::random(4))
            . '-'
            . strtoupper(Str::random(4));

        $reason = $request->input('reason') ?: 'Admin Gift';
        $discordId = (string) $request->input('discord_id');
        $adminDiscordId = (string) $request->input('admin_discord_id');
        $amount = (float) $request->input('amount');

        try {
            DB::table('promo_codes')->insert([
                'code'                  => $code,
                'discord_id'            => $discordId,
                'user_id'               => null,
                'amount'                => $amount,
                'used'                  => false,
                'created_by_discord_id' => $adminDiscordId,
                'reason'                => $reason,
                'used_at'               => null,
                'created_at'            => now(),
            ]);

            try {
                \Convoy\Facades\Activity::event('admin:promo-code-generate')
                    ->description("Admin <@{$adminDiscordId}> generated {$amount} BOLT promo code ({$code}) for <@{$discordId}> with reason: '{$reason}'")
                    ->property([
                        'code'                   => $code,
                        'amount'                 => $amount,
                        'target_discord_id'      => $discordId,
                        'admin_discord_id'       => $adminDiscordId,
                        'reason'                 => $reason,
                    ])
                    ->withRequestMetadata()
                    ->log();
            } catch (\Throwable $t) {}

        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Failed to generate promo code: " . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'ok' => false,
                'error' => 'An error occurred while generating the promo code.',
            ], 500);
        }

        return response()->json([
            'ok'     => true,
            'code'   => $code,
            'amount' => $amount,
            'reason' => $reason,
        ]);
    }

    /**
     * Admin: reset all stats for one Discord user.
     * POST /api/bot/admin/reset-user   { discord_id }
     */
    public function adminResetUser(Request $request): JsonResponse
    {
        $request->validate(['discord_id' => 'required|string|max:32']);
        $id = $request->input('discord_id');

        $exists = DB::table('discord_stats')->where('discord_id', $id)->exists();
        if ($exists) {
            DB::table('discord_stats')
                ->where('discord_id', $id)
                ->update(['messages' => 0, 'boosts' => 0, 'updated_at' => now()]);
        } else {
            DB::table('discord_stats')->insert([
                'discord_id' => $id,
                'messages'   => 0,
                'boosts'     => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        DB::table('discord_invited_users')->where('inviter_discord_id', $id)->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * Admin: reset all stats for every user.
     * POST /api/bot/admin/reset-all
     */
    public function adminResetAll(Request $request): JsonResponse
    {
        DB::table('discord_stats')->update(['messages' => 0, 'boosts' => 0, 'updated_at' => now()]);
        DB::table('discord_invited_users')->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * Admin: add balance (BOLTs) to a user account.
     * POST /api/bot/admin/balance/add   { discord_id, amount, admin_discord_id, reason? }
     */
    public function adminAddBalance(Request $request): JsonResponse
    {
        $this->ensureTablesExist();

        $request->validate([
            'discord_id'       => 'required|string|max:32',
            'amount'           => 'required|numeric|min:0.01',
            'admin_discord_id' => 'required|string|max:32',
            'reason'           => 'nullable|string|max:255',
        ]);

        $discordId = (string) $request->input('discord_id');
        $adminDiscordId = (string) $request->input('admin_discord_id');
        $amount = round((float) $request->input('amount'), 2);
        $reason = $request->input('reason') ?: 'Admin Credit Grant';

        /** @var User|null $user */
        $user = User::where('discord_id', $discordId)->first();
        if (!$user) {
            return response()->json([
                'ok'    => false,
                'error' => "No linked Vertex panel account found for Discord user <@{$discordId}>. The user must sign in and link their Discord account in Account Settings first.",
            ], 404);
        }

        $oldBalance = round((float) ($user->credits ?? 0), 2);
        $newBalance = round($oldBalance + $amount, 2);

        try {
            DB::transaction(function () use ($user, $amount, $newBalance, $reason, $adminDiscordId, $discordId) {
                DB::table('users')->where('id', $user->id)->update(['credits' => $newBalance]);

                try {
                    $user->creditTransactions()->create([
                        'amount'       => $amount,
                        'type'         => 'admin_deposit',
                        'description'  => "Admin Balance Grant: {$reason}",
                        'reference_id' => 'ADMIN-ADD-' . strtoupper(Str::random(8)),
                    ]);
                } catch (\Throwable $t) {
                    \Illuminate\Support\Facades\Log::warning("Credit transaction record skipped: " . $t->getMessage());
                }

                try {
                    \Convoy\Facades\Activity::event('admin:balance-add')
                        ->actor($user)
                        ->description("Admin <@{$adminDiscordId}> added {$amount} BOLTs to {$user->name} (<@{$discordId}>). Reason: '{$reason}'")
                        ->property([
                            'admin_discord_id' => $adminDiscordId,
                            'target_user_id'   => $user->id,
                            'target_discord_id'=> $discordId,
                            'amount_added'     => $amount,
                            'old_balance'      => $user->credits,
                            'new_balance'      => $newBalance,
                            'reason'           => $reason,
                        ])
                        ->withRequestMetadata()
                        ->log();
                } catch (\Throwable $t) {}
            });
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Failed to add balance: " . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'ok'    => false,
                'error' => 'Database error occurred while adding balance: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'ok'           => true,
            'user'         => [
                'id'         => $user->id,
                'name'       => $user->name,
                'email'      => $user->email,
                'discord_id' => $user->discord_id,
            ],
            'amount_added' => $amount,
            'old_balance'  => $oldBalance,
            'new_balance'  => $newBalance,
            'reason'       => $reason,
        ]);
    }

    /**
     * Admin: deduct balance (BOLTs) from a user account.
     * POST /api/bot/admin/balance/deduct   { discord_id, amount, admin_discord_id, reason? }
     */
    public function adminDeductBalance(Request $request): JsonResponse
    {
        $this->ensureTablesExist();

        $request->validate([
            'discord_id'       => 'required|string|max:32',
            'amount'           => 'required|numeric|min:0.01',
            'admin_discord_id' => 'required|string|max:32',
            'reason'           => 'nullable|string|max:255',
        ]);

        $discordId = (string) $request->input('discord_id');
        $adminDiscordId = (string) $request->input('admin_discord_id');
        $amount = round((float) $request->input('amount'), 2);
        $reason = $request->input('reason') ?: 'Admin Credit Deduction';

        /** @var User|null $user */
        $user = User::where('discord_id', $discordId)->first();
        if (!$user) {
            return response()->json([
                'ok'    => false,
                'error' => "No linked Vertex panel account found for Discord user <@{$discordId}>. The user must sign in and link their Discord account in Account Settings first.",
            ], 404);
        }

        $oldBalance = round((float) ($user->credits ?? 0), 2);
        if ($oldBalance <= 0) {
            return response()->json([
                'ok'    => false,
                'error' => "User {$user->name} already has 0.00 BOLTs balance. Cannot deduct balance further.",
            ], 422);
        }

        $newBalance = max(0.0, round($oldBalance - $amount, 2));
        $actualDeducted = round($oldBalance - $newBalance, 2);

        try {
            DB::transaction(function () use ($user, $actualDeducted, $oldBalance, $newBalance, $reason, $adminDiscordId, $discordId) {
                DB::table('users')->where('id', $user->id)->update(['credits' => $newBalance]);

                try {
                    $user->creditTransactions()->create([
                        'amount'       => -$actualDeducted,
                        'type'         => 'admin_deduction',
                        'description'  => "Admin Balance Deduction: {$reason}",
                        'reference_id' => 'ADMIN-DED-' . strtoupper(Str::random(8)),
                    ]);
                } catch (\Throwable $t) {
                    \Illuminate\Support\Facades\Log::warning("Credit transaction record skipped: " . $t->getMessage());
                }

                try {
                    \Convoy\Facades\Activity::event('admin:balance-deduct')
                        ->actor($user)
                        ->description("Admin <@{$adminDiscordId}> deducted {$actualDeducted} BOLTs from {$user->name} (<@{$discordId}>). Reason: '{$reason}'")
                        ->property([
                            'admin_discord_id' => $adminDiscordId,
                            'target_user_id'   => $user->id,
                            'target_discord_id'=> $discordId,
                            'amount_deducted'  => $actualDeducted,
                            'old_balance'      => $oldBalance,
                            'new_balance'      => $newBalance,
                            'reason'           => $reason,
                        ])
                        ->withRequestMetadata()
                        ->log();
                } catch (\Throwable $t) {}
            });
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Failed to deduct balance: " . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'ok'    => false,
                'error' => 'Database error occurred while deducting balance: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'ok'              => true,
            'user'            => [
                'id'         => $user->id,
                'name'       => $user->name,
                'email'      => $user->email,
                'discord_id' => $user->discord_id,
            ],
            'amount_deducted' => $actualDeducted,
            'old_balance'     => $oldBalance,
            'new_balance'     => $newBalance,
            'reason'          => $reason,
        ]);
    }

    /**
     * Admin: hard set a user's balance to an exact amount.
     * POST /api/bot/admin/balance/set   { discord_id, amount, admin_discord_id, reason? }
     */
    public function adminSetBalance(Request $request): JsonResponse
    {
        $this->ensureTablesExist();

        $request->validate([
            'discord_id'       => 'required|string|max:32',
            'amount'           => 'required|numeric|min:0',
            'admin_discord_id' => 'required|string|max:32',
            'reason'           => 'nullable|string|max:255',
        ]);

        $discordId = (string) $request->input('discord_id');
        $adminDiscordId = (string) $request->input('admin_discord_id');
        $targetBalance = round((float) $request->input('amount'), 2);
        $reason = $request->input('reason') ?: 'Staff Hard Ledger Override';

        /** @var User|null $user */
        $user = User::where('discord_id', $discordId)->first();
        if (!$user) {
            return response()->json([
                'ok'    => false,
                'error' => "No linked Vertex panel account found for Discord user <@{$discordId}>. The user must sign in and link their Discord account in Account Settings first.",
            ], 404);
        }

        $oldBalance = round((float) ($user->credits ?? 0), 2);
        $diff = round($targetBalance - $oldBalance, 2);

        try {
            DB::transaction(function () use ($user, $oldBalance, $targetBalance, $diff, $reason, $adminDiscordId, $discordId) {
                DB::table('users')->where('id', $user->id)->update(['credits' => $targetBalance]);

                try {
                    $user->creditTransactions()->create([
                        'amount'       => $diff,
                        'type'         => 'admin_hard_set',
                        'description'  => "Admin Hard Balance Set ({$oldBalance} -> {$targetBalance} BOLTs): {$reason}",
                        'reference_id' => 'ADMIN-SET-' . strtoupper(Str::random(8)),
                    ]);
                } catch (\Throwable $t) {
                    \Illuminate\Support\Facades\Log::warning("Credit transaction record skipped: " . $t->getMessage());
                }

                try {
                    \Convoy\Facades\Activity::event('admin:balance-hard-set')
                        ->actor($user)
                        ->description("Admin <@{$adminDiscordId}> forcefully set {$user->name} (<@{$discordId}>) balance from {$oldBalance} to {$targetBalance} BOLTs (diff: {$diff}). Reason: '{$reason}'")
                        ->property([
                            'admin_discord_id' => $adminDiscordId,
                            'target_user_id'   => $user->id,
                            'target_discord_id'=> $discordId,
                            'old_balance'      => $oldBalance,
                            'new_balance'      => $targetBalance,
                            'difference'       => $diff,
                            'reason'           => $reason,
                        ])
                        ->withRequestMetadata()
                        ->log();
                } catch (\Throwable $t) {}
            });
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Failed to hard set balance: " . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'ok'    => false,
                'error' => 'Database error occurred while hard setting balance: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'ok'          => true,
            'user'        => [
                'id'         => $user->id,
                'name'       => $user->name,
                'email'      => $user->email,
                'discord_id' => $user->discord_id,
            ],
            'old_balance' => $oldBalance,
            'new_balance' => $targetBalance,
            'difference'  => $diff,
            'reason'      => $reason,
        ]);
    }

    /**
     * Admin: revoke an unredeemed promo code.
     * POST /api/bot/admin/promo/revoke   { code, admin_discord_id, reason? }
     */
    public function revokePromoCode(Request $request): JsonResponse
    {
        $this->ensureTablesExist();

        $request->validate([
            'code'             => 'required|string|max:32',
            'admin_discord_id' => 'required|string|max:32',
            'reason'           => 'nullable|string|max:255',
        ]);

        $code = strtoupper(trim($request->input('code')));
        $adminDiscordId = (string) $request->input('admin_discord_id');
        $reason = $request->input('reason') ?: 'Revoked by Administrator';

        $promo = DB::table('promo_codes')->where('code', $code)->first();

        if (!$promo) {
            return response()->json([
                'ok'    => false,
                'error' => "Promo code '{$code}' was not found in the database.",
            ], 404);
        }

        if ($promo->used) {
            $usedDate = $promo->used_at ? Carbon::parse($promo->used_at)->toFormattedDateString() : 'earlier';
            return response()->json([
                'ok'    => false,
                'error' => "Cannot revoke promo code '{$code}' because it has already been redeemed on {$usedDate}.",
            ], 409);
        }

        if (!empty($promo->revoked)) {
            return response()->json([
                'ok'    => false,
                'error' => "Promo code '{$code}' is already revoked.",
            ], 400);
        }

        try {
            DB::table('promo_codes')->where('code', $code)->update([
                'revoked'               => 1,
                'revoked_at'            => now(),
                'revoked_by_discord_id' => $adminDiscordId,
                'revoke_reason'         => $reason,
            ]);

            try {
                \Convoy\Facades\Activity::event('admin:promo-code-revoke')
                    ->description("Admin <@{$adminDiscordId}> revoked {$promo->amount} BOLT promo code ({$code}) for <@{$promo->discord_id}> with reason: '{$reason}'")
                    ->property([
                        'code'                   => $code,
                        'amount'                 => (float) $promo->amount,
                        'target_discord_id'      => $promo->discord_id,
                        'admin_discord_id'       => $adminDiscordId,
                        'reason'                 => $reason,
                    ])
                    ->withRequestMetadata()
                    ->log();
            } catch (\Throwable $t) {}

        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Failed to revoke promo code: " . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'ok'    => false,
                'error' => 'Database error occurred while revoking promo code: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'ok'      => true,
            'message' => "Promo code '{$code}' has been successfully revoked.",
            'promo'   => [
                'code'                  => $code,
                'amount'                => (float) $promo->amount,
                'discord_id'            => $promo->discord_id,
                'original_reason'       => $promo->reason ?? 'Admin Gift',
                'created_at'            => $promo->created_at ? Carbon::parse($promo->created_at)->toIso8601String() : null,
                'revoked_at'            => now()->toIso8601String(),
                'revoked_by_discord_id' => $adminDiscordId,
                'revoke_reason'         => $reason,
            ],
        ]);
    }

    /**
     * Admin: get all promo codes for a Discord user.
     * GET /api/bot/admin/user-promos/{discordId}
     * POST /api/bot/admin/user-promos   { discord_id }
     */
    public function getUserPromoCodes(Request $request, ?string $discordId = null): JsonResponse
    {
        $this->ensureTablesExist();

        $id = $discordId ?: $request->input('discord_id') ?: $request->input('query');
        if (empty($id)) {
            return response()->json(['ok' => false, 'error' => 'No Discord ID provided.'], 400);
        }

        if (preg_match('/<@!?(\d+)>/', $id, $matches)) {
            $id = $matches[1];
        }

        $user = User::where('discord_id', $id)->first();

        $promoQuery = DB::table('promo_codes')->orderBy('created_at', 'desc');
        if ($user) {
            $promoQuery->where(function ($q) use ($id, $user) {
                $q->where('discord_id', $id)->orWhere('user_id', $user->id);
            });
        } else {
            $promoQuery->where('discord_id', $id);
        }

        $promos = $promoQuery->take(50)->get()->map(function ($p) {
            $status = 'unclaimed';
            if ($p->used) {
                $status = 'claimed';
            } elseif (!empty($p->revoked)) {
                $status = 'revoked';
            }

            return [
                'code'                  => $p->code,
                'amount'                => (float) $p->amount,
                'status'                => $status, // unclaimed, claimed, revoked
                'used'                  => (bool) $p->used,
                'used_at'               => $p->used_at ? Carbon::parse($p->used_at)->toIso8601String() : null,
                'revoked'               => (bool) ($p->revoked ?? false),
                'revoked_at'            => !empty($p->revoked_at) ? Carbon::parse($p->revoked_at)->toIso8601String() : null,
                'revoked_by_discord_id' => $p->revoked_by_discord_id ?? null,
                'revoke_reason'         => $p->revoke_reason ?? null,
                'created_by_discord_id' => $p->created_by_discord_id,
                'reason'                => $p->reason ?? 'Admin Gift',
                'created_at'            => $p->created_at ? Carbon::parse($p->created_at)->toIso8601String() : null,
                'timestamp'             => $p->created_at ? Carbon::parse($p->created_at)->timestamp : time(),
            ];
        });

        return response()->json([
            'ok'         => true,
            'discord_id' => $id,
            'user'       => $user ? [
                'id'      => $user->id,
                'name'    => $user->name,
                'email'   => $user->email,
                'credits' => (float) ($user->credits ?? 0),
            ] : null,
            'promos'     => $promos->values(),
        ]);
    }

    // =========================================================================
    // PROMO CODE REDEMPTION
    // =========================================================================

    /**
     * Redeem a promo code.
     * POST /api/bot/promo/redeem   { code, discord_id }
     */
    public function redeemPromoCode(Request $request): JsonResponse
    {
        $request->validate([
            'code'       => 'required|string|max:32',
            'discord_id' => 'required|string|max:32',
        ]);

        $this->ensureTablesExist();

        $code      = strtoupper(trim($request->input('code')));
        $discordId = $request->input('discord_id');

        $promo = DB::table('promo_codes')->where('code', $code)->first();

        if (!$promo) {
            return response()->json(['ok' => false, 'error' => 'Invalid code. Please check and try again.'], 404);
        }

        if ($promo->used) {
            return response()->json(['ok' => false, 'error' => 'This code has already been redeemed.'], 409);
        }

        if (!empty($promo->revoked)) {
            return response()->json(['ok' => false, 'error' => 'This promo code has been revoked by an administrator and can no longer be redeemed.'], 410);
        }

        if ((string) $promo->discord_id !== (string) $discordId) {
            return response()->json(['ok' => false, 'error' => 'This code was not issued for your Discord account.'], 403);
        }

        $user = User::where('discord_id', $discordId)->first();

        if (!$user) {
            return response()->json([
                'ok'    => false,
                'error' => 'Your Discord account is not linked to a Vertex panel account. Please sign in at the panel and link your Discord first.',
            ], 404);
        }

        try {
            DB::transaction(function () use ($promo, $user, $code) {
                DB::table('users')->where('id', $user->id)->increment('credits', $promo->amount);

                try {
                    $user->creditTransactions()->create([
                        'amount'       => $promo->amount,
                        'type'         => 'bonus',
                        'description'  => 'Promo Code Redemption',
                        'reference_id' => $code,
                    ]);
                } catch (\Throwable $t) {
                    \Illuminate\Support\Facades\Log::warning("Credit transaction record skipped: " . $t->getMessage());
                }

                DB::table('promo_codes')->where('code', $code)->update([
                    'used'    => 1,
                    'user_id' => $user->id,
                    'used_at' => now(),
                ]);
            });
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Failed to redeem promo code: " . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'ok'    => false,
                'error' => 'An error occurred while redeeming the code.',
            ], 500);
        }

        $newBalance = DB::table('users')->where('id', $user->id)->value('credits') ?? 0;

        return response()->json([
            'ok'          => true,
            'amount'      => $promo->amount,
            'new_balance' => round((float) $newBalance, 2),
            'message'     => "✅ Code redeemed! **{$promo->amount} credits** added to your Vertex account.",
        ]);
    }

    // =========================================================================
    // USER HISTORY — for Discord Bot /userinfo and /add_bolts commands
    // =========================================================================

    /**
     * Get comprehensive user balance, spending history, promo history, owned servers,
     * server lifecycle history, and Discord tracking stats.
     * POST /api/bot/user-history   { identifier }
     * GET  /api/bot/user-history/{identifier}
     */
    public function getUserHistory(Request $request, ?string $identifier = null): JsonResponse
    {
        $this->ensureTablesExist();

        $rawQuery = $identifier ?? $request->input('identifier') ?? $request->input('discord_id') ?? $request->input('query') ?? '';
        $query = trim((string) $rawQuery);

        if (empty($query)) {
            return response()->json(['ok' => false, 'error' => 'No user identifier provided.'], 400);
        }

        // Clean Discord mention format <@!123456> or <@123456>
        if (preg_match('/<@!?(\d+)>/', $query, $matches)) {
            $query = $matches[1];
        }

        $user = null;
        $discordId = null;

        if (is_numeric($query) && strlen($query) >= 15) {
            // Discord snowflake ID
            $discordId = $query;
            $user = User::where('discord_id', $discordId)->first();
        } elseif (is_numeric($query)) {
            // Numeric Panel ID or Discord ID
            $user = User::find((int) $query);
            if (!$user) {
                $user = User::where('discord_id', $query)->first();
                $discordId = $query;
            } else {
                $discordId = $user->discord_id;
            }
        } elseif (str_contains($query, '@')) {
            // Email search
            $user = User::where('email', $query)->first();
            if ($user && $user->discord_id) {
                $discordId = $user->discord_id;
            }
        } else {
            // Username or Discord Username search
            $user = User::where('name', 'like', "%{$query}%")
                ->orWhere('discord_username', 'like', "%{$query}%")
                ->first();
            if ($user && $user->discord_id) {
                $discordId = $user->discord_id;
            }
        }

        // Check discord stats and promo codes even if no panel user is linked yet
        $discordStats = null;
        $joined = 0;
        $left = 0;
        $fake = 0;
        $valid = 0;

        if ($discordId) {
            $statsRow = DB::table('discord_stats')->where('discord_id', $discordId)->first();
            if ($statsRow) {
                $discordStats = [
                    'messages' => (int) ($statsRow->messages ?? 0),
                    'boosts'   => (int) ($statsRow->boosts ?? 0),
                ];
            }

            $invited = DB::table('discord_invited_users')->where('inviter_discord_id', $discordId)->get();
            $joined = $invited->count();
            $left   = $invited->where('status', 'left')->count();
            $fake   = $invited->where('is_fake', true)->count();
            $valid  = $invited->where('status', 'joined')->where('is_fake', false)->count();
        }

        // Fetch promo codes issued to this discord ID or redeemed by this user
        $promoQuery = DB::table('promo_codes')->orderBy('created_at', 'desc');
        if ($user && $discordId) {
            $promoQuery->where(function ($q) use ($discordId, $user) {
                $q->where('discord_id', $discordId)->orWhere('user_id', $user->id);
            });
        } elseif ($discordId) {
            $promoQuery->where('discord_id', $discordId);
        } elseif ($user) {
            $promoQuery->where('user_id', $user->id);
        } else {
            $promoQuery->whereRaw('0 = 1');
        }
        $promoCodes = $promoQuery->take(50)->get();

        if (!$user && !$discordStats && $promoCodes->isEmpty()) {
            return response()->json([
                'ok'    => false,
                'error' => "No account or activity found for '{$rawQuery}'. Make sure the Discord account is linked or enter a valid email/ID.",
            ], 404);
        }

        // Spending History & Transactions
        $transactions = collect();
        $totalSpent = 0.0;
        $totalDeposited = 0.0;
        $totalBonus = 0.0;
        $totalPromoClaimed = 0.0;

        if ($user) {
            $allTx = DB::table('credit_transactions')
                ->where('user_id', $user->id)
                ->orderBy('id', 'desc')
                ->get();

            foreach ($allTx as $tx) {
                $amt = (float) $tx->amount;
                if ($amt < 0) {
                    $totalSpent += abs($amt);
                } elseif (in_array($tx->type, ['topup', 'deposit', 'admin_deposit'])) {
                    $totalDeposited += $amt;
                } elseif (in_array($tx->type, ['bonus', 'promo'])) {
                    $totalBonus += $amt;
                    if (str_contains(strtolower($tx->description ?? ''), 'promo')) {
                        $totalPromoClaimed += $amt;
                    }
                } else {
                    $totalDeposited += $amt;
                }
            }

            $transactions = $allTx->take(30)->map(function ($tx) {
                return [
                    'id'           => $tx->id,
                    'amount'       => (float) $tx->amount,
                    'type'         => $tx->type,
                    'description'  => $tx->description,
                    'reference_id' => $tx->reference_id,
                    'created_at'   => $tx->created_at ? Carbon::parse($tx->created_at)->toIso8601String() : null,
                    'timestamp'    => $tx->created_at ? Carbon::parse($tx->created_at)->timestamp : time(),
                ];
            });
        }

        // Owned Active Servers
        $ownedServers = collect();
        if ($user) {
            $servers = \Convoy\Models\Server::with('node')
                ->where('user_id', $user->id)
                ->orderBy('id', 'desc')
                ->get();

            $ownedServers = $servers->map(function ($srv) {
                $status = $srv->status ?? 'in_use';
                if ($srv->expires_at && Carbon::parse($srv->expires_at)->isPast() && $status === 'suspended') {
                    $status = 'expired';
                }

                $ramMb = $srv->memory > 100000 ? (int) round($srv->memory / (1024 * 1024)) : (int) $srv->memory;
                $diskMb = $srv->disk > 100000 ? (int) round($srv->disk / (1024 * 1024)) : (int) $srv->disk;

                return [
                    'id'          => $srv->id,
                    'uuid_short'  => $srv->uuid_short,
                    'vmid'        => $srv->vmid,
                    'name'        => $srv->name,
                    'hostname'    => $srv->hostname,
                    'status'      => $status, // 'in_use', 'installing', 'suspended', 'expired', 'deleting'
                    'node_name'   => $srv->node?->name ?? 'Primary Node',
                    'ip'          => $srv->node?->fqdn ?? 'N/A',
                    'memory_mb'   => $ramMb,
                    'cpu_cores'   => (float) $srv->cpu,
                    'disk_mb'     => $diskMb,
                    'description' => $srv->description,
                    'expires_at'  => $srv->expires_at ? Carbon::parse($srv->expires_at)->toIso8601String() : null,
                    'created_at'  => $srv->created_at ? Carbon::parse($srv->created_at)->toIso8601String() : null,
                ];
            });
        }

        // Server Lifecycle History from Activity Logs
        $serverHistory = collect();
        if ($user) {
            $logs = \Convoy\Models\ActivityLog::where('actor_id', $user->id)
                ->where('actor_type', User::class)
                ->where(function ($q) {
                    $q->where('event', 'like', 'server:%')
                      ->orWhere('event', 'like', 'vps:%')
                      ->orWhere('event', 'like', 'bolts:spend%');
                })
                ->orderBy('id', 'desc')
                ->take(40)
                ->get();

            $serverHistory = $logs->map(function ($log) {
                $props = $log->properties ? $log->properties->toArray() : [];
                $event = $log->event;

                $statusBadge = 'In Use';
                if (str_contains($event, 'delete')) {
                    $statusBadge = 'Deleted';
                } elseif (str_contains($event, 'suspend')) {
                    $statusBadge = 'Suspended';
                } elseif (str_contains($event, 'renew')) {
                    $statusBadge = 'Renewed';
                } elseif (str_contains($event, 'create') || str_contains($event, 'deploy')) {
                    $statusBadge = 'Deployed';
                } elseif (str_contains($event, 'power') || str_contains($event, 'reboot')) {
                    $statusBadge = 'Rebooted';
                }

                return [
                    'id'           => $log->id,
                    'event'        => $event,
                    'description'  => $log->description ?: $event,
                    'status_badge' => $statusBadge,
                    'server_name'  => $props['server_name'] ?? null,
                    'vmid'         => $props['vmid'] ?? null,
                    'plan_name'    => $props['plan_name'] ?? null,
                    'node_name'    => $props['node_name'] ?? null,
                    'cost'         => $props['cost'] ?? $props['price'] ?? $props['amount'] ?? null,
                    'properties'   => $props,
                    'created_at'   => $log->created_at ? Carbon::parse($log->created_at)->toIso8601String() : null,
                    'timestamp'    => $log->created_at ? Carbon::parse($log->created_at)->timestamp : time(),
                ];
            });
        }

        // Formatted Promo Codes list
        $promoList = $promoCodes->map(function ($p) {
            return [
                'code'                  => $p->code,
                'amount'                => (float) $p->amount,
                'used'                  => (bool) $p->used,
                'used_at'               => $p->used_at ? Carbon::parse($p->used_at)->toIso8601String() : null,
                'revoked'               => (bool) ($p->revoked ?? false),
                'revoked_at'            => !empty($p->revoked_at) ? Carbon::parse($p->revoked_at)->toIso8601String() : null,
                'revoked_by_discord_id' => $p->revoked_by_discord_id ?? null,
                'revoke_reason'         => $p->revoke_reason ?? null,
                'created_by_discord_id' => $p->created_by_discord_id,
                'reason'                => $p->reason ?? 'Admin Gift',
                'created_at'            => $p->created_at ? Carbon::parse($p->created_at)->toIso8601String() : null,
                'timestamp'             => $p->created_at ? Carbon::parse($p->created_at)->timestamp : time(),
            ];
        });

        $totalPromoGeneratedBolts = $promoCodes->sum('amount');
        $totalPromoClaimedBolts = $promoCodes->where('used', true)->sum('amount');

        return response()->json([
            'ok'      => true,
            'user'    => $user ? [
                'id'               => $user->id,
                'name'             => $user->name,
                'email'            => $user->email,
                'discord_id'       => $user->discord_id,
                'discord_username' => $user->discord_username,
                'google_email'     => $user->google_email,
                'credits'          => (float) ($user->credits ?? 0),
                'root_admin'       => (bool) ($user->root_admin ?? false),
                'created_at'       => $user->created_at ? $user->created_at->toIso8601String() : null,
                'timestamp'        => $user->created_at ? $user->created_at->timestamp : null,
            ] : null,
            'discord' => [
                'discord_id' => $discordId,
                'stats'      => $discordStats,
                'invites'    => [
                    'joined' => $joined,
                    'left'   => $left,
                    'fake'   => $fake,
                    'valid'  => $valid,
                ],
            ],
            'balance' => (float) ($user?->credits ?? 0),
            'summary' => [
                'current_balance'          => (float) ($user?->credits ?? 0),
                'total_spent'              => round($totalSpent, 2),
                'total_deposited'          => round($totalDeposited, 2),
                'total_bonus'              => round($totalBonus, 2),
                'total_promo_claimed'      => round($totalPromoClaimed > 0 ? $totalPromoClaimed : $totalPromoClaimedBolts, 2),
                'total_promo_generated'    => round($totalPromoGeneratedBolts, 2),
                'active_servers'           => $ownedServers->count(),
                'total_servers_lifetime'   => $ownedServers->count() + $serverHistory->where('status_badge', 'Deleted')->count(),
                'total_transactions'       => $transactions->count(),
                'total_promo_codes_issued' => $promoCodes->count(),
            ],
            'spending_history' => $transactions->values(),
            'promo_history'    => $promoList->values(),
            'owned_servers'    => $ownedServers->values(),
            'server_history'   => $serverHistory->values(),
        ]);
    }

    /**
     * Look up detailed info on a transaction / reference ID.
     * GET /api/bot/transaction/{identifier} or POST /api/bot/transaction
     */
    public function getTransactionDetails(Request $request, ?string $identifier = null): JsonResponse
    {
        $this->ensureTablesExist();

        $rawQuery = trim($identifier ?? (string) $request->input('reference_id', $request->input('query', '')));
        if (empty($rawQuery)) {
            return response()->json([
                'ok'    => false,
                'error' => 'Please provide a transaction ID or reference (e.g. RENEW-5OBDSIRG).',
            ], 422);
        }

        $tx = CreditTransaction::where('reference_id', $rawQuery)
            ->orWhere('id', is_numeric($rawQuery) ? (int) $rawQuery : -1)
            ->first();

        // If not found directly, check promo codes
        $promo = null;
        if (!$tx) {
            $promo = DB::table('promo_codes')->where('code', $rawQuery)->first();
            if ($promo && $promo->user_id) {
                $tx = CreditTransaction::where('user_id', $promo->user_id)
                    ->where(function ($q) use ($promo) {
                        $q->where('reference_id', $promo->code)
                          ->orWhere('description', 'like', "%{$promo->code}%");
                    })
                    ->first();
            }
        }

        if (!$tx && !$promo) {
            // Also check activity_logs properties
            $activityLog = ActivityLog::where('properties->reference_id', $rawQuery)
                ->orWhere('properties->tx_id', $rawQuery)
                ->first();

            if (!$activityLog) {
                return response()->json([
                    'ok'    => false,
                    'error' => "Transaction or reference ID '{$rawQuery}' was not found.",
                ], 404);
            }

            $actor = $activityLog->actor_id ? User::find($activityLog->actor_id) : null;
            $props = $activityLog->properties ? $activityLog->properties->toArray() : [];

            return response()->json([
                'ok'          => true,
                'transaction' => [
                    'id'           => $activityLog->id,
                    'reference_id' => $rawQuery,
                    'amount'       => (float) ($props['amount'] ?? $props['price'] ?? $props['cost'] ?? 0),
                    'type'         => $activityLog->event,
                    'description'  => $activityLog->description,
                    'created_at'   => $activityLog->created_at ? $activityLog->created_at->toIso8601String() : null,
                    'timestamp'    => $activityLog->created_at ? $activityLog->created_at->timestamp : time(),
                ],
                'user'        => $actor ? [
                    'id'               => $actor->id,
                    'name'             => $actor->name,
                    'email'            => $actor->email,
                    'discord_id'       => $actor->discord_id,
                    'discord_username' => $actor->discord_username,
                    'credits'          => (float) $actor->credits,
                    'root_admin'       => (bool) $actor->root_admin,
                ] : null,
                'server'      => null,
                'promo'       => null,
                'lifecycle'   => [],
            ]);
        }

        /** @var User|null $user */
        $user = $tx ? User::find($tx->user_id) : ($promo && $promo->user_id ? User::find($promo->user_id) : null);

        // Extract server name from description or related activity logs
        $serverName = null;
        $desc = $tx->description ?? '';
        if (preg_match('/(?:Deployed VPS:\s*|Renewed VPS Instance:\s*|VPS server \')([^\'|(]+)/i', $desc, $matches)) {
            $serverName = trim($matches[1]);
        }

        // Search for related activity logs
        $relatedLogs = collect();
        if ($user) {
            $logQuery = ActivityLog::where('actor_id', $user->id)
                ->where('actor_type', User::class);

            if ($tx && $tx->created_at) {
                $windowStart = Carbon::parse($tx->created_at)->subMinutes(15);
                $windowEnd   = Carbon::parse($tx->created_at)->addMinutes(15);
                $logQuery->whereBetween('created_at', [$windowStart, $windowEnd]);
            }

            $relatedLogs = $logQuery->get();
        }

        // Try resolving server from serverName or subject
        $server = null;
        if ($serverName && $user) {
            $server = Server::with(['node', 'addresses'])
                ->where('user_id', $user->id)
                ->where('name', $serverName)
                ->first();
        }

        if (!$server && $user) {
            foreach ($relatedLogs as $l) {
                $props = $l->properties ? $l->properties->toArray() : [];
                if (!empty($props['server_name'])) {
                    $serverName = $props['server_name'];
                    $server = Server::with(['node', 'addresses'])
                        ->where('user_id', $user->id)
                        ->where('name', $serverName)
                        ->first();
                    if ($server) break;
                }
            }
        }

        // Format Server Info
        $serverInfo = null;
        if ($server) {
            $status = $server->status ?? 'in_use';
            if ($server->expires_at && Carbon::parse($server->expires_at)->isPast() && $status === 'suspended') {
                $status = 'expired';
            }

            $ramMb = $server->memory > 100000 ? (int) round($server->memory / (1024 * 1024)) : (int) $server->memory;
            $diskMb = $server->disk > 100000 ? (int) round($server->disk / (1024 * 1024)) : (int) $server->disk;

            $planName = 'Standard Cloud VPS';
            if (!empty($server->description) && preg_match('/Plan:\s*([^|]+)/i', $server->description, $pMatches)) {
                $planName = trim($pMatches[1]);
            }

            $serverInfo = [
                'server_exists'       => true,
                'id'                  => $server->id,
                'uuid'                => $server->uuid,
                'uuid_short'          => $server->uuid_short,
                'vmid'                => $server->vmid,
                'name'                => $server->name,
                'hostname'            => $server->hostname,
                'status'              => $status, // 'in_use', 'suspended', 'expired', 'installing'
                'node_name'           => $server->node?->name ?? 'Primary Node',
                'node_ip'             => $server->node?->fqdn ?? 'N/A',
                'ip_address'          => $server->addresses->first()?->ip ?? $server->node?->fqdn ?? 'N/A',
                'cpu_cores'           => (float) $server->cpu,
                'memory_mb'           => $ramMb,
                'disk_mb'             => $diskMb,
                'plan_name'           => $planName,
                'description'         => $server->description,
                'server_created_at'   => $server->created_at ? $server->created_at->toIso8601String() : null,
                'server_expires_at'   => $server->expires_at ? Carbon::parse($server->expires_at)->toIso8601String() : null,
                'is_expired'          => $server->expires_at ? Carbon::parse($server->expires_at)->isPast() : false,
                'price_when_bought'   => $tx ? abs((float) $tx->amount) : 0,
            ];
        } elseif ($serverName) {
            $createLog = $user ? ActivityLog::where('actor_id', $user->id)
                ->where('event', 'server:create')
                ->where(function ($q) use ($serverName) {
                    $q->where('description', 'like', "%{$serverName}%")
                      ->orWhere('properties->server_name', $serverName);
                })
                ->first() : null;

            $deleteLog = $user ? ActivityLog::where('actor_id', $user->id)
                ->where('event', 'server:delete')
                ->where(function ($q) use ($serverName) {
                    $q->where('description', 'like', "%{$serverName}%")
                      ->orWhere('properties->server_name', $serverName);
                })
                ->first() : null;

            $cProps = $createLog && $createLog->properties ? $createLog->properties->toArray() : [];
            $dProps = $deleteLog && $deleteLog->properties ? $deleteLog->properties->toArray() : [];

            $serverInfo = [
                'server_exists'       => false,
                'status'              => 'deleted',
                'name'                => $serverName,
                'vmid'                => $cProps['vmid'] ?? $dProps['vmid'] ?? null,
                'node_name'           => $cProps['node_name'] ?? 'Primary Node',
                'plan_name'           => $cProps['plan_name'] ?? 'VPS Plan',
                'price_when_bought'   => (float) ($cProps['price'] ?? ($tx ? abs((float) $tx->amount) : 0)),
                'server_created_at'   => $createLog && $createLog->created_at ? $createLog->created_at->toIso8601String() : null,
                'server_deleted_at'   => $deleteLog && $deleteLog->created_at ? $deleteLog->created_at->toIso8601String() : null,
                'server_expires_at'   => null,
                'description'         => 'Deleted Cloud Server',
            ];
        }

        // Promo code information if applicable
        $promoInfo = null;
        if ($promo || ($tx && str_starts_with($tx->reference_id ?? '', 'PROMO-'))) {
            $pRecord = $promo ?: DB::table('promo_codes')->where('code', $tx->reference_id)->first();
            if ($pRecord) {
                $promoInfo = [
                    'code'                  => $pRecord->code,
                    'amount'                => (float) $pRecord->amount,
                    'used'                  => (bool) $pRecord->used,
                    'used_at'               => $pRecord->used_at ? Carbon::parse($pRecord->used_at)->toIso8601String() : null,
                    'revoked'               => (bool) ($pRecord->revoked ?? false),
                    'revoked_at'            => !empty($pRecord->revoked_at) ? Carbon::parse($pRecord->revoked_at)->toIso8601String() : null,
                    'revoked_by_discord_id' => $pRecord->revoked_by_discord_id ?? null,
                    'revoke_reason'         => $pRecord->revoke_reason ?? null,
                    'created_by_discord_id' => $pRecord->created_by_discord_id,
                    'reason'                => $pRecord->reason ?? 'Admin Gift',
                    'created_at'            => $pRecord->created_at ? Carbon::parse($pRecord->created_at)->toIso8601String() : null,
                ];
            }
        }

        // Collect lifecycle events
        $lifecycleLogs = $relatedLogs->map(function (ActivityLog $l) {
            return [
                'event'       => $l->event,
                'description' => $l->description,
                'ip'          => $l->ip,
                'properties'  => $l->properties ? $l->properties->toArray() : [],
                'timestamp'   => $l->created_at ? $l->created_at->toIso8601String() : null,
            ];
        });

        return response()->json([
            'ok'          => true,
            'transaction' => $tx ? [
                'id'           => $tx->id,
                'reference_id' => $tx->reference_id,
                'amount'       => (float) $tx->amount,
                'type'         => $tx->type,
                'description'  => $tx->description,
                'created_at'   => $tx->created_at ? $tx->created_at->toIso8601String() : null,
                'timestamp'    => $tx->created_at ? $tx->created_at->timestamp : time(),
            ] : [
                'id'           => 0,
                'reference_id' => $rawQuery,
                'amount'       => $promo ? (float) $promo->amount : 0,
                'type'         => 'promo',
                'description'  => 'Promo Code Gift',
                'created_at'   => $promo ? $promo->created_at : null,
                'timestamp'    => $promo ? strtotime($promo->created_at) : time(),
            ],
            'user'        => $user ? [
                'id'               => $user->id,
                'name'             => $user->name,
                'email'            => $user->email,
                'discord_id'       => $user->discord_id,
                'discord_username' => $user->discord_username,
                'credits'          => (float) $user->credits,
                'root_admin'       => (bool) $user->root_admin,
                'created_at'       => $user->created_at ? $user->created_at->toIso8601String() : null,
            ] : null,
            'server'      => $serverInfo,
            'promo'       => $promoInfo,
            'lifecycle'   => $lifecycleLogs->values(),
        ]);
    }

    /**
     * Delete a VM/server by id/vmid/uuid with automatic wipe fallback if uninstall fails.
     * POST /api/bot/admin/delete-vm   { server_id, admin_discord_id, user_discord_id, force? }
     */
    public function deleteVm(Request $request): JsonResponse
    {
        $this->ensureTablesExist();

        $validated = $request->validate([
            'server_id'        => 'required',
            'admin_discord_id' => 'required|string',
            'user_discord_id'  => 'required|string',
            'force'            => 'nullable|boolean',
        ]);

        $serverIdentifier = trim((string) $validated['server_id']);
        $adminDiscordId   = trim((string) $validated['admin_discord_id']);
        $userDiscordId    = trim((string) $validated['user_discord_id']);
        $forceWipeOnly    = (bool) ($validated['force'] ?? false);

        /** @var \Convoy\Models\Server|null $server */
        $server = \Convoy\Models\Server::with(['user', 'node'])
            ->where(function ($q) use ($serverIdentifier) {
                if (is_numeric($serverIdentifier)) {
                    $q->where('id', (int) $serverIdentifier)
                      ->orWhere('vmid', (int) $serverIdentifier);
                } else {
                    $q->where('uuid', $serverIdentifier)
                      ->orWhere('uuid_short', $serverIdentifier);
                }
            })
            ->first();

        if (!$server) {
            return response()->json([
                'ok'    => false,
                'error' => "Server '{$serverIdentifier}' was not found in the database.",
            ], 404);
        }

        // Capture snapshot of server metadata before deletion for certificate transcript
        $serverName = $server->name;
        $vmid       = $server->vmid;
        $serverId   = $server->id;
        $nodeName   = $server->node?->name ?? 'Primary Node';
        $nodeIp     = $server->node?->fqdn ?? 'N/A';
        $ramMb      = $server->memory > 100000 ? (int) round($server->memory / (1024 * 1024)) : (int) $server->memory;
        $diskMb     = $server->disk > 100000 ? (int) round($server->disk / (1024 * 1024)) : (int) $server->disk;
        $cpu        = (float) $server->cpu;
        $owner      = $server->user;
        $ownerName  = $owner?->name ?? 'Unknown';
        $ownerEmail = $owner?->email ?? 'Unknown';
        $ownerDisc  = $owner?->discord_id ?? $userDiscordId;

        $deletionMethod = 'standard';
        $deletionError  = null;

        if ($forceWipeOnly) {
            // Explicit force wipe requested
            try {
                $server->addresses()->update(['server_id' => null]);
                $server->delete();
                $deletionMethod = 'wiped';
            } catch (\Throwable $e) {
                return response()->json([
                    'ok'    => false,
                    'error' => 'Force wipe failed: ' . $e->getMessage(),
                ], 500);
            }
        } else {
            // Attempt standard uninstall via ServerDeletionService first
            try {
                $server->update(['status' => null]);
                if (class_exists('\Convoy\Services\Servers\ServerDeletionService')) {
                    $deletionService = app(\Convoy\Services\Servers\ServerDeletionService::class);
                    $deletionService->handle($server);
                    $deletionMethod = 'standard';
                } else {
                    $server->addresses()->update(['server_id' => null]);
                    $server->delete();
                    $deletionMethod = 'wiped';
                }
            } catch (\Throwable $e) {
                // If standard uninstall fails, automatically wipe it without double asking!
                $deletionError = $e->getMessage();
                \Illuminate\Support\Facades\Log::warning("Bot VM standard deletion failed for server #{$serverId} (VMID: {$vmid}): {$deletionError} — automatically falling back to wipe.");
                try {
                    $server->addresses()->update(['server_id' => null]);
                    $server->delete();
                    $deletionMethod = 'automatic_wipe_fallback';
                } catch (\Throwable $wipeEx) {
                    return response()->json([
                        'ok'    => false,
                        'error' => "Standard uninstall failed ({$deletionError}) and wipe fallback failed: " . $wipeEx->getMessage(),
                    ], 500);
                }
            }
        }

        // Log audit event to activity log
        try {
            if (class_exists('\Convoy\Facades\Activity')) {
                \Convoy\Facades\Activity::event('server:delete')
                    ->actor($owner ?? User::where('discord_id', $userDiscordId)->first() ?? User::first())
                    ->description("Deleted VPS server '{$serverName}' (VMID: {$vmid}) via Discord confirmation. Initiated by Admin <@{$adminDiscordId}>, confirmed by Owner <@{$userDiscordId}>. Method: {$deletionMethod}")
                    ->property([
                        'server_name'      => $serverName,
                        'vmid'             => $vmid,
                        'server_id'        => $serverId,
                        'node_name'        => $nodeName,
                        'admin_discord_id' => $adminDiscordId,
                        'user_discord_id'  => $userDiscordId,
                        'method'           => $deletionMethod,
                        'uninstall_error'  => $deletionError,
                    ])
                    ->withRequestMetadata()
                    ->log();
            }
        } catch (\Throwable $e) {}

        return response()->json([
            'ok'      => true,
            'message' => "Server '{$serverName}' (VMID: {$vmid}) has been successfully deleted.",
            'method'  => $deletionMethod,
            'error'   => $deletionError,
            'server'  => [
                'id'         => $serverId,
                'name'       => $serverName,
                'vmid'       => $vmid,
                'node_name'  => $nodeName,
                'ip'         => $nodeIp,
                'cpu_cores'  => $cpu,
                'memory_mb'  => $ramMb,
                'disk_mb'    => $diskMb,
                'owner_name' => $ownerName,
                'owner_email'=> $ownerEmail,
                'owner_discord_id' => $ownerDisc,
                'deleted_at' => now()->toIso8601String(),
                'timestamp'  => time(),
            ],
        ]);
    }


    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    /**
     * Safely insert or increment a stats counter in discord_stats table.
     */
    protected function incrementStat(string $discordId, string $column, int $amount = 1): void
    {
        $exists = DB::table('discord_stats')->where('discord_id', $discordId)->exists();

        if (!$exists) {
            DB::table('discord_stats')->insert([
                'discord_id' => $discordId,
                'messages'   => $column === 'messages' ? $amount : 0,
                'boosts'     => $column === 'boosts' ? $amount : 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            DB::table('discord_stats')
                ->where('discord_id', $discordId)
                ->increment($column, $amount, ['updated_at' => now()]);
        }
    }

    /**
     * Ensure bot tables exist in the database.
     */
    protected function ensureTablesExist(): void
    {
        try {
            DB::statement("ALTER TABLE users MODIFY credits DECIMAL(16,2) NOT NULL DEFAULT 0.00");
        } catch (\Throwable $e) {}

        try {
            DB::statement("ALTER TABLE promo_codes MODIFY amount DECIMAL(16,2) NOT NULL");
        } catch (\Throwable $e) {}

        try {
            DB::statement("ALTER TABLE credit_transactions MODIFY amount DECIMAL(16,2) NOT NULL");
        } catch (\Throwable $e) {}

        if (!\Illuminate\Support\Facades\Schema::hasTable('promo_codes')) {
            try {
                \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
            } catch (\Throwable $e) {}
        }

        if (!\Illuminate\Support\Facades\Schema::hasTable('promo_codes')) {
            try {
                \Illuminate\Support\Facades\Schema::create('promo_codes', function (\Illuminate\Database\Schema\Blueprint $table) {
                    $table->string('code', 32)->primary();
                    $table->string('discord_id', 32)->index();
                    $table->unsignedBigInteger('user_id')->nullable()->index();
                    $table->decimal('amount', 16, 2);
                    $table->boolean('used')->default(false)->index();
                    $table->boolean('revoked')->default(false)->index();
                    $table->string('created_by_discord_id', 32);
                    $table->string('revoked_by_discord_id', 32)->nullable();
                    $table->string('reason', 255)->nullable();
                    $table->string('revoke_reason', 255)->nullable();
                    $table->timestamp('used_at')->nullable();
                    $table->timestamp('revoked_at')->nullable();
                    $table->timestamp('created_at')->useCurrent();
                });
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::error("Failed creating promo_codes table: " . $e->getMessage());
            }
        } else {
            if (!\Illuminate\Support\Facades\Schema::hasColumn('promo_codes', 'reason')) {
                try {
                    \Illuminate\Support\Facades\Schema::table('promo_codes', function (\Illuminate\Database\Schema\Blueprint $table) {
                        $table->string('reason', 255)->nullable()->after('created_by_discord_id');
                    });
                } catch (\Throwable $e) {}
            }
            if (!\Illuminate\Support\Facades\Schema::hasColumn('promo_codes', 'revoked')) {
                try {
                    \Illuminate\Support\Facades\Schema::table('promo_codes', function (\Illuminate\Database\Schema\Blueprint $table) {
                        $table->boolean('revoked')->default(false)->index()->after('used');
                    });
                } catch (\Throwable $e) {}
            }
            if (!\Illuminate\Support\Facades\Schema::hasColumn('promo_codes', 'revoked_at')) {
                try {
                    \Illuminate\Support\Facades\Schema::table('promo_codes', function (\Illuminate\Database\Schema\Blueprint $table) {
                        $table->timestamp('revoked_at')->nullable()->after('used_at');
                    });
                } catch (\Throwable $e) {}
            }
            if (!\Illuminate\Support\Facades\Schema::hasColumn('promo_codes', 'revoked_by_discord_id')) {
                try {
                    \Illuminate\Support\Facades\Schema::table('promo_codes', function (\Illuminate\Database\Schema\Blueprint $table) {
                        $table->string('revoked_by_discord_id', 32)->nullable()->after('created_by_discord_id');
                    });
                } catch (\Throwable $e) {}
            }
            if (!\Illuminate\Support\Facades\Schema::hasColumn('promo_codes', 'revoke_reason')) {
                try {
                    \Illuminate\Support\Facades\Schema::table('promo_codes', function (\Illuminate\Database\Schema\Blueprint $table) {
                        $table->string('revoke_reason', 255)->nullable()->after('reason');
                    });
                } catch (\Throwable $e) {}
            }
        }

        if (!\Illuminate\Support\Facades\Schema::hasTable('discord_stats')) {
            try {
                \Illuminate\Support\Facades\Schema::create('discord_stats', function (\Illuminate\Database\Schema\Blueprint $table) {
                    $table->string('discord_id', 32)->primary();
                    $table->unsignedBigInteger('messages')->default(0);
                    $table->unsignedBigInteger('boosts')->default(0);
                    $table->timestamps();
                });
            } catch (\Throwable $e) {}
        }

        if (!\Illuminate\Support\Facades\Schema::hasTable('discord_invites')) {
            try {
                \Illuminate\Support\Facades\Schema::create('discord_invites', function (\Illuminate\Database\Schema\Blueprint $table) {
                    $table->string('code', 32)->primary();
                    $table->string('inviter_discord_id', 32);
                    $table->timestamp('created_at')->useCurrent();
                });
            } catch (\Throwable $e) {}
        }

        if (!\Illuminate\Support\Facades\Schema::hasTable('discord_invited_users')) {
            try {
                \Illuminate\Support\Facades\Schema::create('discord_invited_users', function (\Illuminate\Database\Schema\Blueprint $table) {
                    $table->string('discord_id', 32)->primary();
                    $table->string('inviter_discord_id', 32)->index();
                    $table->boolean('is_fake')->default(false);
                    $table->string('status', 16)->default('joined');
                    $table->timestamp('created_at')->useCurrent();
                });
            } catch (\Throwable $e) {}
        }
    }

    // =========================================================================
    // PTERODACTYL DEPLOY COMPLETION — called by the panel after install
    // =========================================================================

    /**
     * Receive Pterodactyl deploy completion from the panel webhook controller.
     * Panel POSTs here → we queue a Discord DM so the bot sends credentials.
     *
     * POST /api/bot/ptero-complete
     * Body: { discord_id, deploy_id, status, panel_url, admin_email,
     *         admin_password, panel_fqdn, wings_fqdn, error? }
     */
    public function pterodactylComplete(Request $request): JsonResponse
    {
        $request->validate([
            'discord_id' => 'required|string|max:32',
            'deploy_id'  => 'required|integer',
            'status'     => 'required|string|in:complete,failed',
        ]);

        $this->ensurePteroDmQueueTable();

        DB::table('pterodactyl_dm_queue')->insert([
            'discord_id'     => $request->input('discord_id'),
            'deploy_id'      => $request->input('deploy_id'),
            'status'         => $request->input('status'),
            'panel_url'      => $request->input('panel_url'),
            'admin_email'    => $request->input('admin_email'),
            'admin_password' => $request->input('admin_password'),
            'panel_fqdn'     => $request->input('panel_fqdn'),
            'wings_fqdn'     => $request->input('wings_fqdn'),
            'error'          => $request->input('error'),
            'sent'           => false,
            'created_at'     => now(),
        ]);

        return response()->json(['ok' => true, 'queued' => true]);
    }

    private function ensurePteroDmQueueTable(): void
    {
        if (!\Illuminate\Support\Facades\Schema::hasTable('pterodactyl_dm_queue')) {
            try {
                \Illuminate\Support\Facades\Schema::create('pterodactyl_dm_queue', function (\Illuminate\Database\Schema\Blueprint $table) {
                    $table->id();
                    $table->string('discord_id', 32)->index();
                    $table->unsignedInteger('deploy_id');
                    $table->string('status', 16);
                    $table->string('panel_url', 255)->nullable();
                    $table->string('admin_email', 255)->nullable();
                    $table->string('admin_password', 255)->nullable();
                    $table->string('panel_fqdn', 255)->nullable();
                    $table->string('wings_fqdn', 255)->nullable();
                    $table->text('error')->nullable();
                    $table->boolean('sent')->default(false);
                    $table->timestamp('created_at')->useCurrent();
                });
            } catch (\Throwable $e) {}
        }
    }

    /**
     * Return pending (unsent) Pterodactyl DM queue entries.
     * The bot polls this endpoint to know who to DM.
     * GET /api/bot/ptero-dm-queue
     */
    public function pterodactylDmQueue(Request $request): JsonResponse
    {
        $this->ensurePteroDmQueueTable();

        $pending = DB::table('pterodactyl_dm_queue')
            ->where('sent', false)
            ->orderBy('created_at', 'asc')
            ->limit(50)
            ->get()
            ->toArray();

        return response()->json(['pending' => $pending]);
    }

    /**
     * Mark a DM queue entry as sent so it isn't re-delivered.
     * POST /api/bot/ptero-dm-queue/mark-sent   { id }
     */
    public function pterodactylDmMarkSent(Request $request): JsonResponse
    {
        $request->validate(['id' => 'required|integer']);

        DB::table('pterodactyl_dm_queue')
            ->where('id', $request->input('id'))
            ->update(['sent' => true]);

        return response()->json(['ok' => true]);
    }

    // =========================================================================
    // BOT-INITIATED SAFE SERVER ACTIONS — called from the Discord support bot
    // All endpoints validate server ownership by matching discord_id -> user -> server.user_id
    // Only safe, non-destructive actions (power cycle + rename) are exposed.
    // =========================================================================

    /**
     * Get the live power state of a specific server owned by a Discord user.
     * GET /api/bot/server-state/{discordId}/{serverId}
     */
    public function getServerState(Request $request, string $discordId, string $serverId): JsonResponse
    {
        $user = User::where('discord_id', $discordId)->first();
        if (!$user) {
            return response()->json(['ok' => false, 'error' => 'No panel account linked to this Discord ID.'], 404);
        }

        $server = \Convoy\Models\Server::where('id', (int) $serverId)
            ->where('user_id', $user->id)
            ->with('node')
            ->first();

        if (!$server) {
            return response()->json(['ok' => false, 'error' => 'Server not found or not owned by this user.'], 404);
        }

        // Attempt to get live power state from Proxmox via the node
        $powerState = 'unknown';
        try {
            $nodeService = app(\Convoy\Services\Nodes\NodeService::class ?? null);
            if ($nodeService && method_exists($nodeService, 'getServerStatus')) {
                $status = $nodeService->getServerStatus($server);
                $powerState = $status['status'] ?? 'unknown';
            }
        } catch (\Throwable $e) {
            // Proxmox unreachable — return unknown gracefully
            \Illuminate\Support\Facades\Log::warning('[BotAPI] getServerState: Proxmox unreachable: ' . $e->getMessage());
            $powerState = 'proxmox_unreachable';
        }

        return response()->json([
            'ok'          => true,
            'id'          => $server->id,
            'vmid'        => $server->vmid,
            'name'        => $server->name,
            'status'      => $server->status ?? 'in_use',
            'power_state' => $powerState,
        ]);
    }

    /**
     * Perform a safe power action (start / shutdown / reboot) on a user's server.
     * POST /api/bot/server-action   { discord_id, server_id, action }
     * action ∈ ['start', 'shutdown', 'reboot']
     */
    public function performServerAction(Request $request): JsonResponse
    {
        $request->validate([
            'discord_id' => 'required|string|max:32',
            'server_id'  => 'required|integer',
            'action'     => 'required|string|in:start,shutdown,reboot',
        ]);

        $discordId = (string) $request->input('discord_id');
        $serverId  = (int) $request->input('server_id');
        $action    = (string) $request->input('action');

        $user = User::where('discord_id', $discordId)->first();
        if (!$user) {
            return response()->json(['ok' => false, 'error' => 'No panel account linked to this Discord ID.'], 404);
        }

        $server = \Convoy\Models\Server::where('id', $serverId)
            ->where('user_id', $user->id)
            ->first();

        if (!$server) {
            return response()->json(['ok' => false, 'error' => 'Server not found or not owned by this user.'], 404);
        }

        // Map action strings to Proxmox state values
        $stateMap = [
            'start'    => 'start',
            'shutdown' => 'shutdown',
            'reboot'   => 'reboot',
        ];

        try {
            // Dispatch via the existing server state update mechanism
            $serverStateService = app(\Convoy\Services\Servers\ServerStateService::class ?? \Convoy\Services\Servers\ServerService::class ?? null);

            if ($serverStateService && method_exists($serverStateService, 'updatePowerState')) {
                $serverStateService->updatePowerState($server, $stateMap[$action]);
            } elseif ($serverStateService && method_exists($serverStateService, 'power')) {
                $serverStateService->power($server, $action);
            } else {
                // Fallback: directly update via Proxmox API if available
                $node = $server->node;
                if (!$node) {
                    return response()->json(['ok' => false, 'error' => 'Server node not found.'], 503);
                }
                // Try to call Proxmox directly through the node's service
                throw new \RuntimeException('No server power service available — check app bindings.');
            }

            // Log the action
            try {
                \Convoy\Facades\Activity::event('bot:server-power-action')
                    ->actor($user)
                    ->description("Discord bot performed '{$action}' on server #{$server->id} ({$server->name}) for user {$user->name} (<@{$discordId}>)")
                    ->property([
                        'server_id'  => $server->id,
                        'server_name'=> $server->name,
                        'action'     => $action,
                        'discord_id' => $discordId,
                    ])
                    ->withRequestMetadata()
                    ->log();
            } catch (\Throwable $t) {}

            return response()->json([
                'ok'      => true,
                'message' => ucfirst($action) . ' command sent to ' . $server->name . ' successfully.',
                'action'  => $action,
                'server'  => $server->name,
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('[BotAPI] performServerAction error: ' . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'ok'    => false,
                'error' => 'Failed to send ' . $action . ' command: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Rename a server owned by a Discord user.
     * POST /api/bot/server-rename   { discord_id, server_id, name }
     */
    public function renameServer(Request $request): JsonResponse
    {
        $request->validate([
            'discord_id' => 'required|string|max:32',
            'server_id'  => 'required|integer',
            'name'       => 'required|string|min:1|max:40',
        ]);

        $discordId = (string) $request->input('discord_id');
        $serverId  = (int) $request->input('server_id');
        $newName   = trim((string) $request->input('name'));

        $user = User::where('discord_id', $discordId)->first();
        if (!$user) {
            return response()->json(['ok' => false, 'error' => 'No panel account linked to this Discord ID.'], 404);
        }

        $server = \Convoy\Models\Server::where('id', $serverId)
            ->where('user_id', $user->id)
            ->first();

        if (!$server) {
            return response()->json(['ok' => false, 'error' => 'Server not found or not owned by this user.'], 404);
        }

        $oldName = $server->name;

        try {
            DB::table('servers')->where('id', $server->id)->update(['name' => $newName]);

            try {
                \Convoy\Facades\Activity::event('bot:server-rename')
                    ->actor($user)
                    ->description("Discord bot renamed server #{$server->id} from '{$oldName}' to '{$newName}' for user {$user->name} (<@{$discordId}>)")
                    ->property([
                        'server_id' => $server->id,
                        'old_name'  => $oldName,
                        'new_name'  => $newName,
                        'discord_id'=> $discordId,
                    ])
                    ->withRequestMetadata()
                    ->log();
            } catch (\Throwable $t) {}

            return response()->json([
                'ok'   => true,
                'name' => $newName,
                'id'   => $server->id,
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('[BotAPI] renameServer error: ' . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'ok'    => false,
                'error' => 'Failed to rename server: ' . $e->getMessage(),
            ], 500);
        }
    }
}
