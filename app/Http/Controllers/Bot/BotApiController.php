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
        $this->ensureTablesExist();
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
        $this->ensureTablesExist();
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
     * POST /api/bot/admin/generate-code   { discord_id, amount, admin_discord_id }
     * Returns: { code }
     */
    public function generatePromoCode(Request $request): JsonResponse
    {
        $request->validate([
            'discord_id'       => 'required|string|max:32',
            'amount'           => 'required|numeric|min:1',
            'admin_discord_id' => 'required|string|max:32',
        ]);

        $this->ensureTablesExist();

        $code = 'LMN-'
            . strtoupper(Str::random(4))
            . '-'
            . strtoupper(Str::random(4));

        try {
            DB::table('promo_codes')->insert([
                'code'                  => $code,
                'discord_id'            => (string) $request->input('discord_id'),
                'user_id'               => null,
                'amount'                => (int) $request->input('amount'),
                'used'                  => false,
                'created_by_discord_id' => (string) $request->input('admin_discord_id'),
                'used_at'               => null,
                'created_at'            => now(),
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Failed to generate promo code: " . $e->getMessage());
            return response()->json([
                'ok' => false,
                'error' => 'Database error generating promo code: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json(['ok' => true, 'code' => $code]);
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

        if ($promo->discord_id !== $discordId) {
            return response()->json(['ok' => false, 'error' => 'This code was not issued for your Discord account.'], 403);
        }

        $user = User::where('discord_id', $discordId)->first();

        if (!$user) {
            return response()->json([
                'ok'    => false,
                'error' => 'Your Discord account is not linked to a Vertex panel account. Please sign in at the panel and link your Discord first.',
            ], 404);
        }

        DB::transaction(function () use ($promo, $user, $code) {
            $user->increment('credits', $promo->amount);

            $user->creditTransactions()->create([
                'amount'       => $promo->amount,
                'type'         => 'bonus',
                'description'  => 'Promo Code Redemption',
                'reference_id' => $code,
            ]);

            DB::table('promo_codes')->where('code', $code)->update([
                'used'    => true,
                'user_id' => $user->id,
                'used_at' => now(),
            ]);
        });

        return response()->json([
            'ok'          => true,
            'amount'      => $promo->amount,
            'new_balance' => round($user->fresh()->credits, 2),
            'message'     => "✅ Code redeemed! **{$promo->amount} credits** added to your Vertex account.",
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
                    $table->unsignedInteger('amount');
                    $table->boolean('used')->default(false)->index();
                    $table->string('created_by_discord_id', 32);
                    $table->timestamp('used_at')->nullable();
                    $table->timestamp('created_at')->useCurrent();
                });
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::error("Failed creating promo_codes table: " . $e->getMessage());
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
}
