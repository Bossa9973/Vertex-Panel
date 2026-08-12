<?php

namespace Convoy\Http\Controllers\Admin;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\ResellerCoinBalance;
use Convoy\Models\ResellerTransaction;
use Convoy\Models\ResellerWithdrawal;
use Convoy\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminResellerController extends Controller
{
    /**
     * List all users with Reseller Status
     */
    public function index(Request $request): JsonResponse
    {
        $query = User::query();

        if ($request->has('resellers_only') && $request->boolean('resellers_only')) {
            $query->where('is_reseller', true);
        }

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $users = $query->orderBy('id', 'desc')->with('coinBalances')->paginate(20);

        // Append reseller coin balance summary
        $users->getCollection()->transform(function ($user) {
            $u = $user->toReactObject();
            $u['id'] = $user->id;
            $u['is_reseller'] = (bool) $user->is_reseller;
            $u['reseller_notes'] = $user->reseller_notes;
            $u['coin_balances'] = $user->coinBalances; // already eager-loaded above
            return $u;
        });

        return response()->json([
            'users' => $users,
        ]);
    }

    /**
     * Grant or Revoke Reseller Access for a User
     */
    public function toggleResellerStatus(Request $request, $id): JsonResponse
    {
        $id = (int) $id;
        $user = User::findOrFail($id);

        $validated = $request->validate([
            'is_reseller' => 'required|boolean',
            'reseller_notes' => 'nullable|string|max:1000',
            'plan_type' => 'nullable|string|in:own_inventory,zero_cost',
        ]);

        $user->is_reseller = $validated['is_reseller'];
        if (isset($validated['reseller_notes'])) {
            $user->reseller_notes = $validated['reseller_notes'];
        }
        if ($validated['is_reseller'] && isset($validated['plan_type'])) {
            $user->reseller_plan_type = $validated['plan_type'];
        }
        if (!$validated['is_reseller']) {
            // Revoke: clear plan type
            $user->reseller_plan_type = null;
        }
        $user->save();

        $statusStr = $user->is_reseller ? 'granted' : 'revoked';
        $planLabel = $user->reseller_plan_type === 'own_inventory' ? 'Own Inventory' : 'Zero Cost';

        \Convoy\Facades\Activity::event('admin:reseller_status')
            ->actor($request->user())
            ->subject($user)
            ->description("Reseller access {$statusStr} for user {$user->name} ({$user->email})" . ($user->is_reseller ? " | Plan: {$planLabel}" : ''))
            ->log();

        return response()->json([
            'message' => "Reseller access successfully {$statusStr} for {$user->name}.",
            'user' => array_merge($user->toReactObject(), ['id' => $user->id]),
        ]);
    }

    /**
     * List all Withdrawal Requests Queue
     */
    public function getWithdrawals(Request $request): JsonResponse
    {
        $query = ResellerWithdrawal::with('user');

        if ($status = $request->input('status')) {
            $query->where('status', $status);
        }

        $withdrawals = $query->orderBy('id', 'desc')->paginate(20);

        return response()->json([
            'withdrawals' => $withdrawals,
        ]);
    }

    /**
     * Admin Approve Crypto Payout & Record TxID
     */
    public function approveWithdrawal(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'tx_hash' => 'required|string|min:5|max:255',
            'admin_notes' => 'nullable|string|max:1000',
        ]);

        $withdrawal = ResellerWithdrawal::findOrFail($id);

        if ($withdrawal->status !== 'pending') {
            return response()->json([
                'message' => "Withdrawal request is already {$withdrawal->status}.",
            ], 400);
        }

        $coinBalance = ResellerCoinBalance::where('user_id', $withdrawal->user_id)
            ->where('coin', $withdrawal->coin)
            ->firstOrFail();

        $amount = (float) $withdrawal->amount;

        // Deduct from both balance and locked_balance
        $coinBalance->balance = max(0, (float) $coinBalance->balance - $amount);
        $coinBalance->locked_balance = max(0, (float) $coinBalance->locked_balance - $amount);
        $coinBalance->save();

        $withdrawal->status = 'approved';
        $withdrawal->tx_hash = $validated['tx_hash'];
        $withdrawal->admin_notes = $validated['admin_notes'] ?? 'Payout verified and sent via company crypto wallet.';
        $withdrawal->save();

        ResellerTransaction::create([
            'user_id' => $withdrawal->user_id,
            'type' => 'withdrawal_completed',
            'coin' => $withdrawal->coin,
            'amount' => -$amount,
            'reference_id' => $withdrawal->uuid,
            'description' => "Payout completed! TxID: {$validated['tx_hash']}",
        ]);

        \Convoy\Facades\Activity::event('admin:reseller_withdrawal_approved')
            ->actor($request->user())
            ->subject($withdrawal)
            ->description("Approved payout of {$amount} {$withdrawal->coin} for user ID {$withdrawal->user_id}. TxID: {$validated['tx_hash']}")
            ->log();

        return response()->json([
            'message' => 'Withdrawal approved successfully!',
            'withdrawal' => $withdrawal,
        ]);
    }

    /**
     * Admin Reject Withdrawal & Refund Locked Coin Balance
     */
    public function rejectWithdrawal(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'admin_notes' => 'required|string|max:1000',
        ]);

        $withdrawal = ResellerWithdrawal::findOrFail($id);

        if ($withdrawal->status !== 'pending') {
            return response()->json([
                'message' => "Withdrawal request is already {$withdrawal->status}.",
            ], 400);
        }

        $coinBalance = ResellerCoinBalance::where('user_id', $withdrawal->user_id)
            ->where('coin', $withdrawal->coin)
            ->firstOrFail();

        $amount = (float) $withdrawal->amount;

        // Unlock balance back to user's available balance
        $coinBalance->locked_balance = max(0, (float) $coinBalance->locked_balance - $amount);
        $coinBalance->save();

        $withdrawal->status = 'rejected';
        $withdrawal->admin_notes = $validated['admin_notes'];
        $withdrawal->save();

        ResellerTransaction::create([
            'user_id' => $withdrawal->user_id,
            'type' => 'withdrawal_refunded',
            'coin' => $withdrawal->coin,
            'amount' => $amount,
            'reference_id' => $withdrawal->uuid,
            'description' => "Withdrawal request rejected. Balance unlocked. Reason: {$validated['admin_notes']}",
        ]);

        return response()->json([
            'message' => 'Withdrawal request rejected and balance unlocked.',
            'withdrawal' => $withdrawal,
        ]);
    }
}
