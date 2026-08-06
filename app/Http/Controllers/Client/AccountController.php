<?php

namespace Convoy\Http\Controllers\Client;

use Convoy\Http\Controllers\ApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AccountController extends ApiController
{
    /**
     * Get details for Account Management page.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'success' => true,
            'data' => [
                'name' => $user->name,
                'email' => $user->email,
                'credits' => (float) $user->credits,
                'created_at' => $user->created_at ? $user->created_at->toIso8601String() : null,
                'primary_auth_provider' => $user->primary_auth_provider ?? 'email',
                'discord_id' => $user->discord_id,
                'discord_username' => $user->discord_username,
                'google_id' => $user->google_id,
                'google_email' => $user->google_email,
                'has_password' => !empty($user->password),
            ],
        ]);
    }

    /**
     * Update user profile information (Name / Email).
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->validate([
            'name' => 'required|string|max:191',
            'email' => [
                'required',
                'email',
                'max:191',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
        ]);

        $user->name = trim($request->input('name'));
        $user->email = strtolower(trim($request->input('email')));
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Profile details updated successfully!',
            'data' => [
                'name' => $user->name,
                'email' => $user->email,
            ],
        ]);
    }

    /**
     * Unlink a linked authentication method (Discord or Google).
     * Rejects unlinking if the method is the original/primary registration provider.
     */
    public function unlinkProvider(Request $request): JsonResponse
    {
        $request->validate([
            'provider' => 'required|string|in:discord,google',
        ]);

        $user = $request->user();
        $provider = $request->input('provider');
        $primaryProvider = $user->primary_auth_provider ?? 'email';

        if ($provider === $primaryProvider) {
            return response()->json([
                'success' => false,
                'message' => "You cannot unlink your primary registration method (" . ucfirst($primaryProvider) . ").",
            ], 400);
        }

        if ($provider === 'discord') {
            $user->discord_id = null;
            $user->discord_username = null;
            $user->save();
        } elseif ($provider === 'google') {
            $user->google_id = null;
            $user->google_email = null;
            $user->save();
        }

        return response()->json([
            'success' => true,
            'message' => ucfirst($provider) . ' account successfully unlinked from your profile.',
            'data' => [
                'primary_auth_provider' => $primaryProvider,
                'discord_id' => $user->discord_id,
                'discord_username' => $user->discord_username,
                'google_id' => $user->google_id,
                'google_email' => $user->google_email,
            ],
        ]);
    }

    /**
     * Redeem a promo code via the website.
     * Requires the user to have a linked Discord account (codes are issued to Discord IDs).
     */
    public function redeemPromoCode(Request $request): JsonResponse
    {
        $request->validate([
            'code' => 'required|string|max:32',
        ]);

        $user = $request->user();
        $code = strtoupper(trim($request->input('code')));

        // Must have Discord linked — promo codes are tied to Discord ID
        if (empty($user->discord_id)) {
            return response()->json([
                'success' => false,
                'message' => 'You must link your Discord account before redeeming a promo code.',
            ], 403);
        }

        $promo = \Illuminate\Support\Facades\DB::table('promo_codes')
            ->where('code', $code)
            ->first();

        if (!$promo) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid code. Please check the code and try again.',
            ], 404);
        }

        if ($promo->used) {
            return response()->json([
                'success' => false,
                'message' => 'This code has already been redeemed.',
            ], 409);
        }

        if ($promo->discord_id !== $user->discord_id) {
            return response()->json([
                'success' => false,
                'message' => 'This code was not issued for your Discord account.',
            ], 403);
        }

        // Credit the user and mark code used atomically
        \Illuminate\Support\Facades\DB::transaction(function () use ($promo, $user, $code) {
            $user->increment('credits', $promo->amount);

            $user->creditTransactions()->create([
                'amount'       => $promo->amount,
                'type'         => 'bonus',
                'description'  => 'Promo Code Redemption',
                'reference_id' => $code,
            ]);

            \Illuminate\Support\Facades\DB::table('promo_codes')
                ->where('code', $code)
                ->update([
                    'used'    => true,
                    'user_id' => $user->id,
                    'used_at' => now(),
                ]);
        });

        try {
            \Convoy\Facades\Activity::event('bolts:redeem-promo')
                ->actor($user)
                ->description("Redeemed promo code '{$code}' (+{$promo->amount} BOLTs)")
                ->property(['code' => $code, 'credits' => (float) $promo->amount])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

        return response()->json([
            'success'     => true,
            'message'     => "Code redeemed! {$promo->amount} credits have been added to your account.",
            'amount'      => $promo->amount,
            'new_balance' => round($user->fresh()->credits, 2),
        ]);
    }
}
