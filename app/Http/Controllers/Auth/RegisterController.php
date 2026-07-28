<?php

namespace Convoy\Http\Controllers\Auth;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class RegisterController extends Controller
{
    /**
     * Handle user registration request.
     */
    public function register(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:191',
            'email' => 'required|string|email|max:191|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
        ], [
            'email.unique' => 'An account with this email address already exists. Please sign in instead.',
        ]);

        /** @var User $user */
        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'credits' => 10.00, // Welcome bonus credits
            'root_admin' => false,
        ]);

        // Record welcome bonus transaction
        $user->creditTransactions()->create([
            'amount' => 10.00,
            'type' => 'bonus',
            'description' => 'Welcome Bonus Credits',
            'reference_id' => 'BONUS-' . Str::upper(Str::random(8)),
        ]);

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json([
            'success' => true,
            'user' => $user->toReactObject(),
        ]);
    }
}
