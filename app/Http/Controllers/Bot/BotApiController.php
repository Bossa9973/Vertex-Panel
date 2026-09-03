<?php

namespace Convoy\Http\Controllers\Bot;

use Convoy\Enums\Server\BackupCompressionType;
use Convoy\Enums\Server\BackupMode;
use Convoy\Exceptions\Service\Backup\TooManyBackupsException;
use Convoy\Http\Controllers\Controller;
use Convoy\Models\ActivityLog;
use Convoy\Models\CreditTransaction;
use Convoy\Models\Node;
use Convoy\Models\Server;
use Convoy\Models\User;
use Convoy\Services\Backups\BackupCreationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Throwable;

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
     * Bulk store multiple invite codes in one database operation.
     * POST /api/bot/invite/track-bulk   { invites: [ { code, inviter_discord_id }, ... ] }
     */
    public function trackInvitesBulk(Request $request): JsonResponse
    {
        $invites = $request->input('invites', []);
        if (!is_array($invites) || empty($invites)) {
            return response()->json(['ok' => true, 'count' => 0]);
        }

        $records = [];
        foreach ($invites as $item) {
            $code = $item['code'] ?? null;
            $inviter = $item['inviter_discord_id'] ?? null;
            if ($code && $inviter) {
                $records[] = [
                    'code'               => substr((string) $code, 0, 32),
                    'inviter_discord_id' => substr((string) $inviter, 0, 32),
                ];
            }
        }

        if (!empty($records)) {
            foreach (array_chunk($records, 200) as $chunk) {
                DB::table('discord_invites')->upsert($chunk, ['code'], ['inviter_discord_id']);
            }
        }

        return response()->json(['ok' => true, 'count' => count($records)]);
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

        if ($amount > 8000) {
            return response()->json([
                'ok'    => false,
                'error' => 'Cannot generate promo code for more than 8,000 BOLTs. Hard cap is 8,000 BOLTs.',
            ], 422);
        }

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

        if ($newBalance > 8000) {
            return response()->json([
                'ok'    => false,
                'error' => "Cannot add balance: Resulting balance ({$newBalance} BOLTs) would exceed the 8,000 BOLTs hard cap.",
            ], 422);
        }

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

        if ($targetBalance > 8000) {
            return response()->json([
                'ok'    => false,
                'error' => "Cannot set balance: Target amount ({$targetBalance} BOLTs) exceeds the 8,000 BOLTs hard cap.",
            ], 422);
        }

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
        $promoAmount = 0.0;
        $newBalance = 0.0;

        try {
            DB::transaction(function () use ($code, $discordId, &$promoAmount, &$newBalance) {
                // Lock promo row for update to prevent concurrent double-redemption
                $promo = DB::table('promo_codes')->where('code', $code)->lockForUpdate()->first();

                if (!$promo) {
                    throw new \Exception('Invalid code. Please check and try again.');
                }

                if ($promo->used) {
                    throw new \Exception('This code has already been redeemed.');
                }

                if (!empty($promo->revoked)) {
                    throw new \Exception('This promo code has been revoked by an administrator and can no longer be redeemed.');
                }

                if ((string) $promo->discord_id !== (string) $discordId) {
                    throw new \Exception('This code was not issued for your Discord account.');
                }

                // Lock user row for update to prevent race conditions on balance updates
                $user = User::where('discord_id', $discordId)->lockForUpdate()->first();

                if (!$user) {
                    throw new \Exception('Your Discord account is not linked to a Vertex panel account. Please sign in at the panel and link your Discord first.');
                }

                $promoAmount = (float) $promo->amount;

                if (($user->credits + $promoAmount) > 8000) {
                    throw new \Exception('Cannot redeem promo code: Resulting balance would exceed the 8,000 BOLTs hard cap (Current: ' . number_format($user->credits, 2) . ', Code: ' . number_format($promoAmount, 2) . ').');
                }

                $user->credits += $promoAmount;
                $user->save();
                $newBalance = (float) $user->credits;

                try {
                    $user->creditTransactions()->create([
                        'amount'       => $promoAmount,
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
                'error' => $e->getMessage(),
            ], 400);
        }

        return response()->json([
            'ok'          => true,
            'amount'      => $promoAmount,
            'new_balance' => round($newBalance, 2),
            'message'     => "✅ Code redeemed! **{$promoAmount} credits** added to your Vertex account.",
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
            $servers = \Convoy\Models\Server::with(['node.location', 'addresses'])
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

                $node = $srv->node;
                $location = $node?->location;
                $locationName = $location ? ($location->description ?: $location->short_code) : ($node?->name ?? 'Default Location');
                $locationCode = $location ? strtoupper($location->short_code) : 'N/A';
                $realIp = $srv->addresses->first()?->address ?? ($node?->fqdn ?? 'N/A');

                return [
                    'id'            => $srv->id,
                    'uuid_short'    => $srv->uuid_short,
                    'vmid'          => $srv->vmid,
                    'name'          => $srv->name,
                    'hostname'      => $srv->hostname,
                    'status'        => $status, // 'in_use', 'installing', 'suspended', 'expired', 'deleting'
                    'node_id'       => $srv->node_id,
                    'node_name'     => $node?->name ?? 'Primary Node',
                    'location'      => $locationName,
                    'location_name' => $locationName,
                    'location_code' => $locationCode,
                    'location_id'   => $node?->location_id,
                    'ip'            => $realIp,
                    'memory_mb'     => $ramMb,
                    'cpu_cores'     => (float) $srv->cpu,
                    'disk_mb'       => $diskMb,
                    'description'   => $srv->description,
                    'expires_at'    => $srv->expires_at ? Carbon::parse($srv->expires_at)->toIso8601String() : null,
                    'created_at'    => $srv->created_at ? Carbon::parse($srv->created_at)->toIso8601String() : null,
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

        if (\Illuminate\Support\Facades\Schema::hasTable('users')) {
            if (!\Illuminate\Support\Facades\Schema::hasColumn('users', 'suspended_until')) {
                try {
                    \Illuminate\Support\Facades\Schema::table('users', function (\Illuminate\Database\Schema\Blueprint $table) {
                        $table->timestamp('suspended_until')->nullable()->after('remember_token');
                        $table->string('suspension_reason', 255)->nullable()->after('suspended_until');
                    });
                } catch (\Throwable $e) {}
            }
        }

        if (!\Illuminate\Support\Facades\Schema::hasTable('abuser_records')) {
            try {
                \Illuminate\Support\Facades\Schema::create('abuser_records', function (\Illuminate\Database\Schema\Blueprint $table) {
                    $table->id();
                    $table->unsignedBigInteger('user_id')->nullable()->index();
                    $table->string('discord_id', 64)->nullable()->index();
                    $table->string('username', 128)->nullable();
                    $table->string('email', 191)->nullable();
                    $table->text('reasons')->nullable();
                    $table->string('status', 32)->default('flagged');
                    $table->decimal('old_balance', 16, 2)->default(0.00);
                    $table->decimal('new_balance', 16, 2)->default(0.00);
                    $table->integer('servers_wiped')->default(0);
                    $table->boolean('is_suspended')->default(false);
                    $table->timestamp('suspended_until')->nullable();
                    $table->string('suspension_reason', 255)->nullable();
                    $table->string('action_by_admin', 64)->nullable();
                    $table->text('notes')->nullable();
                    $table->timestamps();
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

    // =========================================================================
    // BACKUP & NODE OPERATIONS — for /backup Discord slash commands
    // =========================================================================

    /**
     * List all Proxmox nodes.
     * GET /api/bot/nodes
     */
    public function getNodes(): JsonResponse
    {
        try {
            $nodes = Node::select('id', 'name')->get();

            return response()->json([
                'ok'   => true,
                'data' => $nodes->map(fn($n) => [
                    'id'   => $n->id,
                    'name' => $n->name,
                ]),
            ]);
        } catch (\Throwable $e) {
            Log::error('[BotAPI] getNodes error: ' . $e->getMessage(), ['exception' => $e]);
            return response()->json(['ok' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Trigger backups for servers and push to Google Drive.
     * POST /api/bot/backup/trigger
     */
    public function triggerBackups(Request $request, BackupCreationService $backupCreationService): JsonResponse
    {
        $validated = $request->validate([
            'server_ids'   => 'nullable|array',
            'server_ids.*' => 'integer|exists:servers,id',
            'node_id'      => 'nullable|integer|exists:nodes,id',
            'tier'         => 'nullable|string|in:all,paid,free',
            'all'          => 'nullable|boolean',
            'force'        => 'nullable|boolean',
        ]);

        $query = Server::query();

        // Filter by specific server IDs
        if (!empty($validated['server_ids'])) {
            $query->whereIn('id', $validated['server_ids']);
        } else {
            // Filter by node if specified
            if (!empty($validated['node_id'])) {
                $query->where('node_id', $validated['node_id']);
            }

            // Filter by plan tier if specified
            $tier = $validated['tier'] ?? 'all';
            if ($tier === 'paid') {
                $query->where('plan_tier', 'paid');
            } elseif ($tier === 'free') {
                $query->where('plan_tier', 'free');
            }
        }

        // Respect 24h backup window unless force=true
        if (!($validated['force'] ?? true)) {
            $query->whereDoesntHave('backups', function ($q) {
                $q->where('created_at', '>', now()->subDay());
            });
        }

        $servers = $query->get();
        $dispatched = 0;
        $skipped = 0;

        foreach ($servers as $server) {
            try {
                $backupCreationService->create(
                    server         : $server,
                    name           : 'Discord Bot backup (' . now()->format('Y-m-d H:i') . ')',
                    mode           : BackupMode::SNAPSHOT,
                    compressionType: BackupCompressionType::ZSTD,
                    isLocked       : false,
                );
                $dispatched++;
            } catch (TooManyBackupsException|TooManyRequestsHttpException $e) {
                $skipped++;
                Log::warning("[BotTriggerBackups] Skipped server #{$server->id}: " . $e->getMessage());
            } catch (\Throwable $e) {
                $skipped++;
                Log::error("[BotTriggerBackups] Error on server #{$server->id}: " . $e->getMessage());
            }
        }

        return response()->json([
            'ok'         => true,
            'message'    => "Dispatched backup for {$dispatched} server(s). Skipped {$skipped}.",
            'dispatched' => $dispatched,
            'skipped'    => $skipped,
        ]);
    }

    /**
     * Update plan tier for a server (free or paid).
     * POST /api/bot/backup/set-tier
     */
    public function setServerTier(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'server_id' => 'required|integer|exists:servers,id',
            'tier'      => 'required|string|in:free,paid',
        ]);

        try {
            $server = Server::findOrFail($validated['server_id']);
            $server->update(['plan_tier' => $validated['tier']]);

            return response()->json([
                'ok'        => true,
                'server_id' => $server->id,
                'name'      => $server->name,
                'plan_tier' => $server->plan_tier,
                'message'   => "Server #{$server->id} ({$server->name}) plan tier updated to {$server->plan_tier}.",
            ]);
        } catch (\Throwable $e) {
            Log::error('[BotAPI] setServerTier error: ' . $e->getMessage(), ['exception' => $e]);
            return response()->json(['ok' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Inspect users who abused multiple tier claims or duplicate staff promo + dashboard claims.
     * GET /api/bot/admin/abuse-list
     */
    public function getAbuseList(): JsonResponse
    {
        $this->ensureTablesExist();

        $taskDefinitions = [
            'invites_15'   => ['category' => 'invites', 'target' => 15, 'reward' => 3000.0, 'title' => '15 Discord Invites'],
            'invites_25'   => ['category' => 'invites', 'target' => 25, 'reward' => 5000.0, 'title' => '25 Discord Invites'],
            'boost_1'      => ['category' => 'boosts',  'target' => 1,  'reward' => 3000.0, 'title' => '1 Server Boost'],
            'boost_2'      => ['category' => 'boosts',  'target' => 2,  'reward' => 5000.0, 'title' => '2 Server Boosts'],
            'messages_200' => ['category' => 'messages','target' => 200,'reward' => 3000.0,'title' => '200 Messages Sent'],
            'messages_300' => ['category' => 'messages','target' => 300,'reward' => 3000.0,'title' => '300 Messages Sent'],
        ];

        // 1. Gather candidate user IDs efficiently using targeted criteria
        $duplicateClaimUsers = DB::table('discord_claims')
            ->select('user_id')
            ->groupBy('user_id')
            ->havingRaw('COUNT(*) > 1')
            ->pluck('user_id')
            ->toArray();

        $promoUsers = DB::table('credit_transactions')
            ->select('user_id')
            ->where(function ($q) {
                $q->whereIn('type', ['bonus', 'admin_deposit', 'topup'])
                  ->orWhere('reference_id', 'LIKE', 'LMN-%')
                  ->orWhere('reference_id', 'LIKE', 'ADMIN-%')
                  ->orWhere('description', 'LIKE', '%promo%');
            })
            ->distinct()
            ->pluck('user_id')
            ->toArray();

        $rewardUsers = DB::table('credit_transactions')
            ->select('user_id')
            ->where('type', 'discord_reward')
            ->orWhere('description', 'LIKE', '%discord task%')
            ->distinct()
            ->pluck('user_id')
            ->toArray();

        $promoRewardCollisionUsers = array_values(array_intersect($promoUsers, $rewardUsers));

        $capViolationUsers = User::where('credits', '>', 8000)->pluck('id')->toArray();

        $candidateUserIds = array_unique(array_merge($duplicateClaimUsers, $promoRewardCollisionUsers, $capViolationUsers));

        if (empty($candidateUserIds)) {
            return response()->json([
                'ok'      => true,
                'count'   => 0,
                'abusers' => [],
            ]);
        }

        // Bulk pre-load all users, claims, and transactions for candidate IDs (3 fast queries total)
        $users = User::with(['servers.node'])->whereIn('id', $candidateUserIds)->get()->keyBy('id');
        $allClaims = DB::table('discord_claims')
            ->whereIn('user_id', $candidateUserIds)
            ->get()
            ->groupBy('user_id');
        $allTxs = DB::table('credit_transactions')
            ->whereIn('user_id', $candidateUserIds)
            ->where('amount', '>', 0)
            ->get()
            ->groupBy('user_id');

        $abusers = [];

        foreach ($candidateUserIds as $userId) {
            /** @var User|null $user */
            $user = $users->get($userId);
            if (!$user) {
                continue;
            }

            $claims = $allClaims->get($user->id, collect());
            $txs = $allTxs->get($user->id, collect());

            $reasons = [];

            // A) Check double claims within each category (e.g. invites_15 AND invites_25)
            $claimsByCategory = [
                'invites'  => [],
                'boosts'   => [],
                'messages' => [],
            ];

            foreach ($claims as $claim) {
                $task = $taskDefinitions[$claim->task_key] ?? null;
                $cat = $task['category'] ?? 'other';
                if (isset($claimsByCategory[$cat])) {
                    $claimsByCategory[$cat][] = [
                        'task_key'     => $claim->task_key,
                        'reward_bolts' => (float) $claim->reward_bolts,
                        'title'        => $task['title'] ?? $claim->task_key,
                    ];
                }
            }

            if (count($claimsByCategory['invites']) > 1) {
                $titles = implode(' & ', array_column($claimsByCategory['invites'], 'title'));
                $reasons[] = "Duplicate Invites Claim: Claimed both {$titles}";
            }
            if (count($claimsByCategory['messages']) > 1) {
                $titles = implode(' & ', array_column($claimsByCategory['messages'], 'title'));
                $reasons[] = "Duplicate Messages Claim: Claimed both {$titles}";
            }
            if (count($claimsByCategory['boosts']) > 1) {
                $titles = implode(' & ', array_column($claimsByCategory['boosts'], 'title'));
                $reasons[] = "Duplicate Boosts Claim: Claimed both {$titles}";
            }

            // B) Check staff promo + dashboard claim collision

            $promoTxs = $txs->filter(function ($t) {
                return in_array($t->type, ['bonus', 'admin_deposit', 'topup'])
                    || str_starts_with($t->reference_id ?? '', 'LMN-')
                    || str_starts_with($t->reference_id ?? '', 'ADMIN-')
                    || str_contains(strtolower($t->description ?? ''), 'promo');
            });

            $dashTxs = $txs->filter(function ($t) {
                return $t->type === 'discord_reward' || str_contains(strtolower($t->description ?? ''), 'discord task');
            });

            foreach ($promoTxs as $pTx) {
                $matchedDash = $dashTxs->first(fn($d) => abs((float)$d->amount - (float)$pTx->amount) < 0.01);
                if ($matchedDash) {
                    $reasons[] = "Promo & Dashboard Collision: Duplicate " . number_format($pTx->amount, 0) . " BOLTs claimed via staff promo and dashboard task ({$matchedDash->reference_id})";
                    break;
                }
            }

            // C) Check if user balance exceeds hard cap 8,000 BOLTs
            if ((float) $user->credits > 8000) {
                $reasons[] = "Balance Cap Violation: Current balance (" . number_format($user->credits, 2) . " BOLTs) exceeds 8,000 hard cap";
            }

            if (!empty($reasons)) {
                // Calculate legitimate highest balance:
                $legitInvites = !empty($claimsByCategory['invites']) ? max(array_column($claimsByCategory['invites'], 'reward_bolts')) : 0.0;
                $legitBoosts  = !empty($claimsByCategory['boosts'])  ? max(array_column($claimsByCategory['boosts'], 'reward_bolts'))  : 0.0;
                $legitMessages= !empty($claimsByCategory['messages'])? max(array_column($claimsByCategory['messages'], 'reward_bolts')): 0.0;

                $legitimateBalance = min(8000.0, round($legitInvites + $legitBoosts + $legitMessages, 2));

                $servers = $user->servers->map(fn($s) => [
                    'id'        => $s->id,
                    'vmid'      => $s->vmid,
                    'name'      => $s->name,
                    'hostname'  => $s->hostname,
                    'node_id'   => $s->node_id,
                    'node_name' => $s->node?->name ?? "Node #{$s->node_id}",
                    'plan_tier' => $s->plan_tier ?? 'free',
                    'status'    => $s->status,
                ]);

                $abusers[] = [
                    'user_id'                    => $user->id,
                    'name'                       => $user->name,
                    'email'                      => $user->email,
                    'discord_id'                 => $user->discord_id,
                    'discord_username'           => $user->discord_username,
                    'current_balance'            => (float) $user->credits,
                    'legitimate_balance'         => $legitimateBalance,
                    'excess_balance'             => max(0.0, round((float) $user->credits - $legitimateBalance, 2)),
                    'reasons'                    => $reasons,
                    'active_servers_count'       => $servers->count(),
                    'servers'                    => $servers->values(),
                    'claims_count'               => $claims->count(),
                ];
            }
        }

        return response()->json([
            'ok'      => true,
            'total'   => count($abusers),
            'abusers' => $abusers,
        ]);
    }

    /**
     * Remediate abusive user: wipe all VPS instances (Proxmox + DB) and reset balance to legitimate reward.
     * POST /api/bot/admin/abuse-remediate
     */
    public function remediateAbuse(Request $request): JsonResponse
    {
        $this->ensureTablesExist();

        $validated = $request->validate([
            'user_id'          => 'nullable',
            'discord_id'       => 'nullable|string',
            'admin_discord_id' => 'required|string',
            'wipe_servers'     => 'nullable|boolean',
            'suspend_days'     => 'nullable|integer|min:0|max:365',
            'reasons'          => 'nullable|array',
        ]);

        $userId = $validated['user_id'] ?? null;
        $discordId = $validated['discord_id'] ?? null;
        $adminDiscordId = $validated['admin_discord_id'];
        $wipeServers = (bool) ($validated['wipe_servers'] ?? true);

        /** @var User|null $user */
        $user = User::query()
            ->when($userId, fn($q) => $q->where('id', $userId))
            ->when($discordId, fn($q) => $q->orWhere('discord_id', $discordId))
            ->first();

        if (!$user) {
            return response()->json([
                'ok'    => false,
                'error' => "User not found for ID: '{$userId}' / Discord: '{$discordId}'.",
            ], 404);
        }

        $oldBalance = (float) $user->credits;
        $wipedServers = [];

        // 1. Wipe all VPS instances (both Proxmox hypervisor & Database)
        if ($wipeServers) {
            $servers = Server::with('node')->where('user_id', $user->id)->get();

            foreach ($servers as $server) {
                $srvInfo = [
                    'id'        => $server->id,
                    'vmid'      => $server->vmid,
                    'name'      => $server->name,
                    'hostname'  => $server->hostname,
                    'node_name' => $server->node?->name ?? "Node #{$server->node_id}",
                    'proxmox_deleted' => false,
                ];

                // Direct Proxmox hypervisor delete
                try {
                    if ($server->node && $server->vmid) {
                        try {
                            app(\Convoy\Repositories\Proxmox\Server\ProxmoxPowerRepository::class)
                                ->setServer($server)
                                ->send(\Convoy\Enums\Server\PowerAction::KILL);
                        } catch (\Throwable) {}

                        app(\Convoy\Repositories\Proxmox\Server\ProxmoxServerRepository::class)
                            ->setServer($server)
                            ->delete();

                        $srvInfo['proxmox_deleted'] = true;
                    }
                } catch (\Throwable $pe) {
                    Log::warning("[AbuseRemediation] Proxmox direct delete warning for server #{$server->id}: " . $pe->getMessage());
                }

                // Disassociate IPs, purge backups, and forcefully wipe from database immediately
                try {
                    $server->addresses()->update(['server_id' => null]);
                    $server->backups()->delete();
                    $server->delete();
                } catch (\Throwable $de) {
                    Log::error("[AbuseRemediation] Database delete error for server #{$server->id}: " . $de->getMessage());
                }

                $wipedServers[] = $srvInfo;
            }
        }

        // 2. Calculate legitimate highest balance
        $claims = DB::table('discord_claims')->where('user_id', $user->id)->get();
        $taskDefinitions = [
            'invites_15'   => ['category' => 'invites', 'reward' => 3000.0],
            'invites_25'   => ['category' => 'invites', 'reward' => 5000.0],
            'boost_1'      => ['category' => 'boosts',  'reward' => 3000.0],
            'boost_2'      => ['category' => 'boosts',  'reward' => 5000.0],
            'messages_200' => ['category' => 'messages','reward' => 3000.0],
            'messages_300' => ['category' => 'messages','reward' => 3000.0],
        ];

        $maxPerCategory = [
            'invites'  => 0.0,
            'boosts'   => 0.0,
            'messages' => 0.0,
        ];

        $highestKeyPerCategory = [];

        foreach ($claims as $claim) {
            $def = $taskDefinitions[$claim->task_key] ?? null;
            $cat = $def['category'] ?? null;
            $rew = (float) ($def['reward'] ?? $claim->reward_bolts);

            if ($cat && isset($maxPerCategory[$cat])) {
                if ($rew >= $maxPerCategory[$cat]) {
                    $maxPerCategory[$cat] = $rew;
                    $highestKeyPerCategory[$cat] = $claim->task_key;
                }
            }
        }

        // Check credit transactions if no claims or for additional promo/milestone claims
        if (array_sum($maxPerCategory) <= 0) {
            $rewardTxs = DB::table('credit_transactions')
                ->where('user_id', $user->id)
                ->where('amount', '>', 0)
                ->where(function ($q) {
                    $q->where('type', 'discord_reward')
                      ->orWhere('description', 'LIKE', '%discord%')
                      ->orWhere('description', 'LIKE', '%promo%')
                      ->orWhereIn('type', ['bonus', 'admin_deposit', 'topup']);
                })
                ->get();

            $maxTx = (float) ($rewardTxs->max('amount') ?? 0.0);
            if ($maxTx > 0) {
                $maxPerCategory['invites'] = min(5000.0, $maxTx);
            }
        }

        // Clean duplicate claims: retain only the highest claim per category
        foreach ($highestKeyPerCategory as $cat => $keepKey) {
            $catKeys = array_keys(array_filter($taskDefinitions, fn($d) => $d['category'] === $cat));
            DB::table('discord_claims')
                ->where('user_id', $user->id)
                ->whereIn('task_key', $catKeys)
                ->where('task_key', '!=', $keepKey)
                ->delete();
        }

        // Calculate legitimate balance to restore:
        // Capped at 8,000 hard limit.
        // Even if user already spent balance on servers, servers are wiped and user is granted
        // the legitimate reward amount they would have had without over-claiming.
        $legitEarned = array_sum($maxPerCategory);
        if ($legitEarned <= 0) {
            // Default to biggest milestone reward (5,000) or historical balance up to 8,000
            $legitEarned = min(5000.0, max(3000.0, $oldBalance));
        }

        $newBalance = min(8000.0, round($legitEarned, 2));

        // 3. Reset User Balance & apply suspension if specified
        $user->credits = $newBalance;

        $suspendDays = (int) ($validated['suspend_days'] ?? 0);
        if ($suspendDays > 0) {
            $user->suspended_until = now()->addDays($suspendDays);
            $user->suspension_reason = "Suspended for {$suspendDays} days following abuse remediation";
        }
        $user->save();

        $diff = round($newBalance - $oldBalance, 2);

        // 4. Record Audit Transaction
        try {
            $user->creditTransactions()->create([
                'amount'       => $diff,
                'type'         => 'admin_remediation',
                'description'  => "Anti-Abuse Remediation: Servers wiped and balance reset from {$oldBalance} to {$newBalance} BOLTs (Admin: <@{$adminDiscordId}>)",
                'reference_id' => 'ABUSE-FIX-' . strtoupper(Str::random(6)),
            ]);
        } catch (\Throwable $t) {
            Log::warning("Credit transaction skipped in remediation: " . $t->getMessage());
        }

        // 5. Persist to abuser_records database table
        $reasons = $validated['reasons'] ?? ['Reward Claim Abuse / Policy Violation'];
        try {
            DB::table('abuser_records')->updateOrInsert(
                ['user_id' => $user->id],
                [
                    'discord_id'        => $user->discord_id,
                    'username'          => $user->name,
                    'email'             => $user->email,
                    'reasons'           => json_encode($reasons),
                    'status'            => $suspendDays > 0 ? 'suspended' : 'remediated',
                    'old_balance'       => $oldBalance,
                    'new_balance'       => $newBalance,
                    'servers_wiped'     => count($wipedServers),
                    'is_suspended'      => $user->suspended_until && \Carbon\Carbon::parse($user->suspended_until)->isFuture(),
                    'suspended_until'   => $user->suspended_until,
                    'suspension_reason' => $user->suspension_reason,
                    'action_by_admin'   => $adminDiscordId,
                    'notes'             => "Remediated by <@{$adminDiscordId}> on " . now()->toDateTimeString(),
                    'updated_at'        => now(),
                    'created_at'        => now(),
                ]
            );
        } catch (\Throwable $t) {
            Log::warning("Could not persist to abuser_records: " . $t->getMessage());
        }

        try {
            \Convoy\Facades\Activity::event('admin:abuse-remediate')
                ->actor($user)
                ->description("Admin <@{$adminDiscordId}> remediated user {$user->name} (<@{$user->discord_id}>). Wiped " . count($wipedServers) . " servers and reset balance to {$newBalance} BOLTs.")
                ->property([
                    'admin_discord_id' => $adminDiscordId,
                    'user_id'          => $user->id,
                    'discord_id'       => $user->discord_id,
                    'old_balance'      => $oldBalance,
                    'new_balance'      => $newBalance,
                    'servers_wiped'    => count($wipedServers),
                    'suspended_until'  => $user->suspended_until,
                ])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $t) {}

        return response()->json([
            'ok'              => true,
            'message'         => "Abuse remediation complete for {$user->name}. Wiped " . count($wipedServers) . " server(s) and set balance to {$newBalance} BOLTs.",
            'user'            => [
                'id'              => $user->id,
                'name'            => $user->name,
                'email'           => $user->email,
                'discord_id'      => $user->discord_id,
                'is_suspended'    => $user->suspended_until && \Carbon\Carbon::parse($user->suspended_until)->isFuture(),
                'suspended_until' => $user->suspended_until,
            ],
            'old_balance'     => $oldBalance,
            'new_balance'     => $newBalance,
            'servers_wiped'   => count($wipedServers),
            'wiped_servers'   => $wipedServers,
        ]);
    }

    /**
     * Get all detected and recorded abusers, their history, and suspension status.
     * GET /api/bot/admin/abusers
     */
    public function getAbusers(Request $request): JsonResponse
    {
        $this->ensureTablesExist();

        $discordId = $request->query('discord_id');
        $userId = $request->query('user_id');

        $query = DB::table('abuser_records');
        if ($discordId) {
            $query->where('discord_id', $discordId);
        }
        if ($userId) {
            $query->where('user_id', $userId);
        }

        $records = $query->orderByDesc('updated_at')->get();

        $userMap = User::whereIn('id', $records->pluck('user_id')->filter())->get()->keyBy('id');

        $formatted = $records->map(function ($rec) use ($userMap) {
            $user = $userMap->get($rec->user_id);
            $suspendedUntil = $user ? $user->suspended_until : $rec->suspended_until;
            $isSuspended = $suspendedUntil && \Carbon\Carbon::parse($suspendedUntil)->isFuture();

            return [
                'id'                => $rec->id,
                'user_id'           => $rec->user_id,
                'discord_id'        => $rec->discord_id ?? ($user?->discord_id),
                'username'          => $rec->username ?? ($user?->name),
                'email'             => $rec->email ?? ($user?->email),
                'status'            => $isSuspended ? 'suspended' : $rec->status,
                'reasons'           => json_decode($rec->reasons, true) ?: [$rec->reasons],
                'old_balance'       => (float) $rec->old_balance,
                'new_balance'       => (float) $rec->new_balance,
                'servers_wiped'     => (int) $rec->servers_wiped,
                'is_suspended'      => (bool) $isSuspended,
                'suspended_until'   => $suspendedUntil,
                'suspension_reason' => $user?->suspension_reason ?? $rec->suspension_reason,
                'action_by_admin'   => $rec->action_by_admin,
                'notes'             => $rec->notes,
                'created_at'        => $rec->created_at,
                'updated_at'        => $rec->updated_at,
            ];
        });

        return response()->json([
            'ok'      => true,
            'count'   => $formatted->count(),
            'abusers' => $formatted,
        ]);
    }

    /**
     * Suspend a user account from earning rewards and deploying VPS servers.
     * POST /api/bot/admin/user-suspend
     */
    public function suspendUser(Request $request): JsonResponse
    {
        $this->ensureTablesExist();

        $validated = $request->validate([
            'user_id'          => 'nullable',
            'discord_id'       => 'nullable|string',
            'admin_discord_id' => 'required|string',
            'days'             => 'nullable|integer|min:1|max:365',
            'reason'           => 'nullable|string|max:255',
        ]);

        $userId = $validated['user_id'] ?? null;
        $discordId = $validated['discord_id'] ?? null;
        $days = (int) ($validated['days'] ?? 14);
        $reason = $validated['reason'] ?? "Suspended for {$days} days for policy violations";

        /** @var User|null $user */
        $user = User::query()
            ->when($userId, fn($q) => $q->where('id', $userId))
            ->when($discordId, fn($q) => $q->orWhere('discord_id', $discordId))
            ->first();

        if (!$user) {
            return response()->json(['ok' => false, 'error' => 'User not found.'], 404);
        }

        $suspendedUntil = now()->addDays($days);
        $user->suspended_until = $suspendedUntil;
        $user->suspension_reason = $reason;
        $user->save();

        DB::table('abuser_records')->updateOrInsert(
            ['user_id' => $user->id],
            [
                'discord_id'        => $user->discord_id,
                'username'          => $user->name,
                'email'             => $user->email,
                'reasons'           => json_encode([$reason]),
                'status'            => 'suspended',
                'is_suspended'      => true,
                'suspended_until'   => $suspendedUntil,
                'suspension_reason' => $reason,
                'action_by_admin'   => $validated['admin_discord_id'],
                'notes'             => "Suspended for {$days} days by <@{$validated['admin_discord_id']}>",
                'updated_at'        => now(),
                'created_at'        => now(),
            ]
        );

        return response()->json([
            'ok'              => true,
            'message'         => "User {$user->name} has been suspended until " . $suspendedUntil->toDateTimeString(),
            'user_id'         => $user->id,
            'discord_id'      => $user->discord_id,
            'suspended_until' => $suspendedUntil->toDateTimeString(),
            'reason'          => $reason,
        ]);
    }

    /**
     * Unsuspend a previously suspended user account.
     * POST /api/bot/admin/user-unsuspend
     */
    public function unsuspendUser(Request $request): JsonResponse
    {
        $this->ensureTablesExist();

        $validated = $request->validate([
            'user_id'          => 'nullable',
            'discord_id'       => 'nullable|string',
            'admin_discord_id' => 'required|string',
        ]);

        $userId = $validated['user_id'] ?? null;
        $discordId = $validated['discord_id'] ?? null;

        /** @var User|null $user */
        $user = User::query()
            ->when($userId, fn($q) => $q->where('id', $userId))
            ->when($discordId, fn($q) => $q->orWhere('discord_id', $discordId))
            ->first();

        if (!$user) {
            return response()->json(['ok' => false, 'error' => 'User not found.'], 404);
        }

        $user->suspended_until = null;
        $user->suspension_reason = null;
        $user->save();

        DB::table('abuser_records')->where('user_id', $user->id)->update([
            'status'            => 'cleared',
            'is_suspended'      => false,
            'suspended_until'   => null,
            'suspension_reason' => null,
            'notes'             => "Unsuspended by <@{$validated['admin_discord_id']}> on " . now()->toDateTimeString(),
            'updated_at'        => now(),
        ]);

        return response()->json([
            'ok'         => true,
            'message'    => "User {$user->name} has been unsuspended.",
            'user_id'    => $user->id,
            'discord_id' => $user->discord_id,
        ]);
    }

    // =========================================================================
    // VM RELOCATION & NODE RELOCATION CONTROLS
    // =========================================================================

    /**
     * List eligible nodes for VM relocation.
     * GET /api/bot/relocation-nodes
     */
    public function getRelocationNodes(Request $request): JsonResponse
    {
        $includeAll = $request->boolean('include_all', false);

        $nodes = \Convoy\Models\Node::query()
            ->with(['location'])
            ->when(!$includeAll, function ($q) {
                $q->where(function ($sub) {
                    $sub->where('allow_relocation', true)
                        ->orWhereNull('allow_relocation');
                });
            })
            ->withCount(['servers'])
            ->get()
            ->map(function (\Convoy\Models\Node $node) {
                $freeIps = \Convoy\Models\Address::whereNull('server_id')
                    ->whereIn('address_pool_id', function ($sub) use ($node) {
                        $sub->select('address_pool_id')
                            ->from('address_pool_to_node')
                            ->where('node_id', $node->id);
                    })
                    ->count();

                $loc = $node->location;
                $locationDesc = $loc ? ($loc->description ?: $loc->short_code) : ($node->name ?? 'Default Location');
                $locationCode = $loc ? strtoupper($loc->short_code) : 'N/A';

                return [
                    'id'                    => $node->id,
                    'name'                  => $node->name,
                    'fqdn'                  => $node->fqdn,
                    'cluster'               => $node->cluster,
                    'allow_relocation'      => (bool) ($node->allow_relocation ?? true),
                    'free_ips_count'        => $freeIps,
                    'servers_count'         => (int) $node->servers_count,
                    'location'              => $locationDesc,
                    'location_name'         => $locationDesc,
                    'location_code'         => $locationCode,
                    'location_id'           => $node->location_id,
                ];
            });

        return response()->json([
            'ok'    => true,
            'nodes' => $nodes,
        ]);
    }

    /**
     * Admin tool: Relocate a user's VM from one node to another.
     * POST /api/bot/admin/relocate-vm   { server_id, target_node_id, admin_discord_id, user_discord_id }
     */
    public function relocateVm(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'server_id'        => 'required',
            'target_node_id'   => 'required|integer|exists:nodes,id',
            'admin_discord_id' => 'required|string|max:32',
            'user_discord_id'  => 'required|string|max:32',
        ]);

        $serverIdentifier = trim((string) $validated['server_id']);
        $targetNodeId     = (int) $validated['target_node_id'];
        $adminDiscordId   = trim((string) $validated['admin_discord_id']);
        $userDiscordId    = trim((string) $validated['user_discord_id']);

        /** @var \Convoy\Models\Server|null $server */
        $server = \Convoy\Models\Server::with(['user', 'node.location', 'addresses'])
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

        /** @var \Convoy\Models\Node $targetNode */
        $targetNode = \Convoy\Models\Node::findOrFail($targetNodeId);

        try {
            /** @var \Convoy\Services\Servers\ServerRelocationService $relocationService */
            $relocationService = app(\Convoy\Services\Servers\ServerRelocationService::class);
            $result = $relocationService->handle($server, $targetNode, $adminDiscordId, $userDiscordId);

            return response()->json($result);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Relocation failed for server #{$server->id}: " . $e->getMessage(), ['exception' => $e]);

            return response()->json([
                'ok'    => false,
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Admin tool: Toggle whether inbound relocations are allowed for a node.
     * POST /api/bot/admin/toggle-node-relocation   { node_identifier, enabled, admin_discord_id }
     */
    public function toggleNodeRelocation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'node_identifier'  => 'required',
            'enabled'          => 'required|boolean',
            'admin_discord_id' => 'required|string|max:32',
        ]);

        $identifier = trim((string) $validated['node_identifier']);
        $enabled    = (bool) $validated['enabled'];

        /** @var \Convoy\Models\Node|null $node */
        $node = \Convoy\Models\Node::query()
            ->when(is_numeric($identifier), fn($q) => $q->where('id', (int) $identifier))
            ->when(!is_numeric($identifier), function ($q) use ($identifier) {
                $q->where('name', $identifier)
                  ->orWhere('fqdn', $identifier)
                  ->orWhere('name', 'LIKE', "%{$identifier}%");
            })
            ->first();

        if (!$node) {
            return response()->json([
                'ok'    => false,
                'error' => "Node '{$identifier}' was not found.",
            ], 404);
        }

        $node->update(['allow_relocation' => $enabled]);

        \Convoy\Facades\Activity::event('node:toggle-relocation')
            ->subject($node)
            ->property(['node_id' => $node->id, 'node_name' => $node->name, 'allow_relocation' => $enabled, 'admin_discord_id' => $validated['admin_discord_id']])
            ->log(($enabled ? 'Enabled' : 'Disabled') . " inbound relocations for node {$node->name} via Discord Bot");

        return response()->json([
            'ok'               => true,
            'node_id'          => $node->id,
            'node_name'        => $node->name,
            'allow_relocation' => (bool) $node->allow_relocation,
            'message'          => "Inbound relocations to **{$node->name}** are now " . ($enabled ? '✅ ENABLED' : '❌ DISABLED') . '.',
        ]);
    }
}

