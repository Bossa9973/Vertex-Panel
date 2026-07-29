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
}
