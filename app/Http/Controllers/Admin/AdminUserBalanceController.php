<?php

namespace Convoy\Http\Controllers\Admin;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AdminUserBalanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min((int) $request->query('per_page', 50), 200);

        $users = User::withCount('servers')
            ->orderBy('id', 'desc')
            ->paginate($perPage)
            ->through(function (User $user) {
                return [
                    'id'           => $user->id,
                    'name'         => $user->name,
                    'email'        => $user->email,
                    'credits'      => (float) $user->credits,
                    'root_admin'   => (bool) $user->root_admin,
                    'servers_count'=> $user->servers_count,
                    'created_at'   => $user->created_at->toIso8601String(),
                ];
            });

        return response()->json([
            'users' => $users,
        ]);
    }

    public function updateCredits(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'action' => 'required|string|in:add,remove,set',
            'amount' => 'required|numeric|min:0.01',
            'description' => 'nullable|string|max:191',
        ]);

        /** @var User $user */
        $user = User::findOrFail($id);
        $action = $request->action;
        $amount = (float) $request->amount;
        $description = $request->description ?: 'Admin Credit Adjustment';

        if ($action === 'add') {
            $user->credits += $amount;
            $user->creditTransactions()->create([
                'amount' => $amount,
                'type' => 'topup',
                'description' => "[Admin Deposit] {$description}",
                'reference_id' => 'ADMIN-ADD-' . Str::upper(Str::random(6)),
            ]);
        } elseif ($action === 'remove') {
            $user->credits = max(0, $user->credits - $amount);
            $user->creditTransactions()->create([
                'amount' => -$amount,
                'type' => 'deduction',
                'description' => "[Admin Deduction] {$description}",
                'reference_id' => 'ADMIN-SUB-' . Str::upper(Str::random(6)),
            ]);
        } elseif ($action === 'set') {
            $diff = $amount - $user->credits;
            $user->credits = $amount;
            $user->creditTransactions()->create([
                'amount' => $diff,
                'type' => $diff >= 0 ? 'topup' : 'deduction',
                'description' => "[Admin Balance Override] Set balance to $" . number_format($amount, 2),
                'reference_id' => 'ADMIN-SET-' . Str::upper(Str::random(6)),
            ]);
        }

        $user->save();

        /** @var User $adminUser */
        $adminUser = $request->user();

        try {
            \Convoy\Facades\Activity::event('bolts:admin-update')
                ->actor($adminUser)
                ->description("Admin '{$adminUser->name}' {$action} {$amount} BOLTs for user '{$user->name}' ({$user->email}) - New Balance: {$user->credits}")
                ->property([
                    'target_user_id'    => $user->id,
                    'target_user_email' => $user->email,
                    'action'            => $action,
                    'amount'            => $amount,
                    'new_balance'       => (float) $user->credits,
                    'reason'            => $description,
                ])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

        return response()->json([
            'success' => true,
            'credits' => (float) $user->credits,
            'message' => "User balance updated successfully.",
        ]);
    }
}
