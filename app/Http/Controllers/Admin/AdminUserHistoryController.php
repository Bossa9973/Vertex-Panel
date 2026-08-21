<?php

namespace Convoy\Http\Controllers\Admin;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\ActivityLog;
use Convoy\Models\CreditTransaction;
use Convoy\Models\Server;
use Convoy\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AdminUserHistoryController extends Controller
{
    /**
     * List users with summary data for the Admin User History explorer.
     * GET /api/admin/user-history
     */
    public function index(Request $request): JsonResponse
    {
        $query = User::withCount('servers')->orderBy('id', 'desc');

        if ($search = trim($request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('discord_id', 'like', "%{$search}%")
                  ->orWhere('discord_username', 'like', "%{$search}%");
                if (is_numeric($search)) {
                    $q->orWhere('id', (int) $search);
                }
            });
        }

        $perPage = min((int) $request->query('per_page', 50), 200);
        $paginated = $query->paginate($perPage);

        $items = collect($paginated->items())->map(function (User $user) {
            return [
                'id'               => $user->id,
                'name'             => $user->name,
                'email'            => $user->email,
                'discord_id'       => $user->discord_id,
                'discord_username' => $user->discord_username,
                'credits'          => (float) $user->credits,
                'root_admin'       => (bool) $user->root_admin,
                'servers_count'    => (int) $user->servers_count,
                'created_at'       => $user->created_at ? $user->created_at->toIso8601String() : null,
            ];
        });

        return response()->json([
            'data'       => $items,
            'pagination' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
        ]);
    }

    /**
     * Get complete detailed history (balance, spending, promos, servers, lifecycle) for a specific user.
     * GET /api/admin/users/{id}/history
     */
    public function show(Request $request, int $id): JsonResponse
    {
        /** @var User $user */
        $user = User::withCount('servers')->findOrFail($id);
        $discordId = $user->discord_id;

        // 1. Transactions & Spending Calculations
        $allTx = CreditTransaction::where('user_id', $user->id)
            ->orderBy('id', 'desc')
            ->get();

        $totalSpent = 0.0;
        $totalDeposited = 0.0;
        $totalBonus = 0.0;
        $totalPromoClaimed = 0.0;

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

        $spendingHistory = $allTx->map(function (CreditTransaction $tx) {
            return [
                'id'           => $tx->id,
                'amount'       => (float) $tx->amount,
                'type'         => $tx->type,
                'description'  => $tx->description,
                'reference_id' => $tx->reference_id,
                'created_at'   => $tx->created_at ? $tx->created_at->toIso8601String() : null,
                'timestamp'    => $tx->created_at ? $tx->created_at->timestamp : time(),
            ];
        });

        // 2. Promo Codes History
        $promoQuery = DB::table('promo_codes')->orderBy('created_at', 'desc');
        if ($discordId) {
            $promoQuery->where(function ($q) use ($discordId, $user) {
                $q->where('discord_id', $discordId)->orWhere('user_id', $user->id);
            });
        } else {
            $promoQuery->where('user_id', $user->id);
        }
        $promoCodes = $promoQuery->get();

        $promoList = $promoCodes->map(function ($p) {
            return [
                'code'                  => $p->code,
                'amount'                => (float) $p->amount,
                'used'                  => (bool) $p->used,
                'used_at'               => $p->used_at ? Carbon::parse($p->used_at)->toIso8601String() : null,
                'created_by_discord_id' => $p->created_by_discord_id,
                'reason'                => $p->reason ?? 'Admin Gift',
                'created_at'            => $p->created_at ? Carbon::parse($p->created_at)->toIso8601String() : null,
                'timestamp'             => $p->created_at ? Carbon::parse($p->created_at)->timestamp : time(),
            ];
        });

        $totalPromoGeneratedBolts = $promoCodes->sum('amount');
        if ($totalPromoClaimed === 0.0) {
            $totalPromoClaimed = (float) $promoCodes->where('used', true)->sum('amount');
        }

        // 3. Owned Active Servers
        $servers = Server::with(['node', 'addresses'])
            ->where('user_id', $user->id)
            ->orderBy('id', 'desc')
            ->get();

        $ownedServers = $servers->map(function (Server $srv) {
            $status = $srv->status ?? 'in_use';
            if ($srv->expires_at && Carbon::parse($srv->expires_at)->isPast() && $status === 'suspended') {
                $status = 'expired';
            }

            $ramMb = $srv->memory > 100000 ? (int) round($srv->memory / (1024 * 1024)) : (int) $srv->memory;
            $diskMb = $srv->disk > 100000 ? (int) round($srv->disk / (1024 * 1024)) : (int) $srv->disk;

            return [
                'id'          => $srv->id,
                'uuid'        => $srv->uuid,
                'uuid_short'  => $srv->uuid_short,
                'vmid'        => $srv->vmid,
                'name'        => $srv->name,
                'hostname'    => $srv->hostname,
                'status'      => $status, // 'in_use', 'installing', 'suspended', 'expired', 'deleting'
                'node_id'     => $srv->node_id,
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

        // 4. Server Lifecycle History (Activity Logs)
        $logs = ActivityLog::where('actor_id', $user->id)
            ->where('actor_type', User::class)
            ->where(function ($q) {
                $q->where('event', 'like', 'server:%')
                  ->orWhere('event', 'like', 'vps:%')
                  ->orWhere('event', 'like', 'bolts:spend%');
            })
            ->orderBy('id', 'desc')
            ->take(100)
            ->get();

        $serverHistory = $logs->map(function (ActivityLog $log) {
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
                'ip'           => $log->ip ?? 'Unknown',
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

        // 5. Discord Stats
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

        return response()->json([
            'user' => [
                'id'               => $user->id,
                'name'             => $user->name,
                'email'            => $user->email,
                'discord_id'       => $user->discord_id,
                'discord_username' => $user->discord_username,
                'google_email'     => $user->google_email,
                'credits'          => (float) $user->credits,
                'root_admin'       => (bool) $user->root_admin,
                'created_at'       => $user->created_at ? $user->created_at->toIso8601String() : null,
            ],
            'balance' => (float) $user->credits,
            'summary' => [
                'current_balance'          => (float) $user->credits,
                'total_spent'              => round($totalSpent, 2),
                'total_deposited'          => round($totalDeposited, 2),
                'total_bonus'              => round($totalBonus, 2),
                'total_promo_claimed'      => round($totalPromoClaimed, 2),
                'total_promo_generated'    => round($totalPromoGeneratedBolts, 2),
                'active_servers'           => $ownedServers->count(),
                'total_servers_lifetime'   => $ownedServers->count() + $serverHistory->where('status_badge', 'Deleted')->count(),
                'total_transactions'       => $spendingHistory->count(),
                'total_promo_codes_issued' => $promoList->count(),
                'total_server_events'      => $serverHistory->count(),
            ],
            'spending_history' => $spendingHistory->values(),
            'promo_history'    => $promoList->values(),
            'owned_servers'    => $ownedServers->values(),
            'server_history'   => $serverHistory->values(),
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
        ]);
    }
}
