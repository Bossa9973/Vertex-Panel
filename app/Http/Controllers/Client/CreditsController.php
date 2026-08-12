<?php

namespace Convoy\Http\Controllers\Client;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CreditsController extends Controller
{
    /**
     * Get user credit balance and transaction history.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $transactions = $user->creditTransactions()
            ->orderBy('id', 'desc')
            ->paginate(15);

        $topupSetting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'credits_topup_enabled')->first();
        $topupEnabled = $topupSetting ? ($topupSetting->value === 'true' || $topupSetting->value === '1') : true;

        $referralSetting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'credits_referral_enabled')->first();
        $referralEnabled = $referralSetting ? ($referralSetting->value === 'true' || $referralSetting->value === '1') : true;

        return response()->json([
            'credits' => (float) ($user->credits ?? 0.00),
            'topup_enabled' => $topupEnabled,
            'referral_enabled' => $referralEnabled,
            'transactions' => $transactions,
        ]);
    }

    /**
     * Top up user credit balance.
     */
    public function topup(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Prevent regular users from granting themselves arbitrary free credits via API requests
        if (!$user->root_admin) {
            return response()->json([
                'success' => false,
                'message' => 'Direct client top-ups are disabled. Please use an official payment gateway (NowPayments or MaxelPay) to add BOLTs credits.',
            ], 403);
        }

        $request->validate([
            'amount' => 'required|numeric|min:1|max:10000',
            'payment_method' => 'nullable|string',
        ]);

        $amount = (float) $request->amount;
        $method = $request->payment_method ?? 'Admin Grant';

        $user->credits = (float) ($user->credits ?? 0.00) + $amount;
        $user->save();

        $transaction = $user->creditTransactions()->create([
            'amount' => $amount,
            'type' => 'topup',
            'description' => "Admin Top-Up Grant via {$method}",
            'reference_id' => 'PAY-' . Str::upper(Str::random(8)),
        ]);

        \Convoy\Facades\Activity::event('bolts:topup')
            ->property(['amount' => $amount, 'method' => $method, 'tx_id' => $transaction->reference_id])
            ->log("Admin topped up {$amount} BOLTs for user {$user->email}");

        return response()->json([
            'success' => true,
            'credits' => (float) $user->credits,
            'transaction' => $transaction,
            'message' => 'Admin top-up successful!',
        ]);
    }
}
