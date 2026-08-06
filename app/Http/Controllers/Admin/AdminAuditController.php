<?php

namespace Convoy\Http\Controllers\Admin;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\ActivityLog;
use Convoy\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AdminAuditController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ActivityLog::with(['actor'])->orderBy('id', 'desc');

        // 1. Tab / Category Filter
        $tab = $request->query('tab', 'all');
        if ($tab === 'auth') {
            $query->where(function ($q) {
                $q->where('event', 'like', 'auth:%')
                  ->orWhere('event', 'user:auth%');
            });
        } elseif ($tab === 'vps') {
            $query->where(function ($q) {
                $q->where('event', 'like', 'server:%')
                  ->orWhere('event', 'like', 'vps:%');
            });
        } elseif ($tab === 'bolts') {
            $query->where(function ($q) {
                $q->where('event', 'like', 'bolts:%')
                  ->orWhere('event', 'like', 'credit:%')
                  ->orWhere('event', 'like', 'balance:%');
            });
        } elseif ($tab === 'admin') {
            $query->where(function ($q) {
                $q->where('event', 'like', 'admin:%')
                  ->orWhere('event', 'like', 'setting:%')
                  ->orWhere('event', 'like', 'role:%');
            });
        }

        // 2. Specific Event Filter
        if ($event = $request->query('event')) {
            $query->where('event', $event);
        }

        // 3. User Filter
        if ($userId = $request->query('user_id')) {
            $query->where('actor_id', $userId)->where('actor_type', User::class);
        }

        // 4. IP Filter
        if ($ip = $request->query('ip')) {
            $query->where('ip', 'like', "%{$ip}%");
        }

        // 5. General Search Term
        if ($search = trim($request->query('search', ''))) {
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                  ->orWhere('event', 'like', "%{$search}%")
                  ->orWhere('ip', 'like', "%{$search}%")
                  ->orWhere('properties', 'like', "%{$search}%")
                  ->orWhereHasMorph('actor', [User::class], function ($uq) use ($search) {
                      $uq->where('name', 'like', "%{$search}%")
                         ->orWhere('email', 'like', "%{$search}%");
                  });
            });
        }

        // 6. Pagination
        $perPage = min(100, max(10, (int) $request->query('per_page', 25)));
        $paginated = $query->paginate($perPage);

        // 7. Calculate Overview Statistics
        $totalLogs = ActivityLog::count();
        $authCount = ActivityLog::where('event', 'like', 'auth:%')->count();
        $vpsCount = ActivityLog::where('event', 'like', 'server:%')->orWhere('event', 'like', 'vps:%')->count();
        $boltsCount = ActivityLog::where('event', 'like', 'bolts:%')->orWhere('event', 'like', 'credit:%')->count();
        $adminCount = ActivityLog::where('event', 'like', 'admin:%')->count();
        $uniqueActors = ActivityLog::whereNotNull('actor_id')->distinct('actor_id')->count('actor_id');
        $uniqueIps = ActivityLog::distinct('ip')->count('ip');

        // Transform results for frontend consumption
        $items = collect($paginated->items())->map(function (ActivityLog $log) {
            /** @var User|null $actor */
            $actor = $log->actor;
            $properties = $log->properties ? $log->properties->toArray() : [];

            // Extract IP & User Agent metadata if stored in properties
            $ip = $properties['ip'] ?? $log->ip ?? 'Unknown';
            $userAgent = $properties['useragent'] ?? $properties['user_agent'] ?? null;

            return [
                'id'          => $log->id,
                'event'       => $log->event,
                'description' => $log->description ?: $log->event,
                'status'      => $log->status ?: 'ok',
                'ip'          => $ip,
                'user_agent'  => $userAgent,
                'properties'  => $properties,
                'created_at'  => $log->created_at ? $log->created_at->toIso8601String() : null,
                'timestamp'   => $log->created_at ? $log->created_at->timestamp : time(),
                'actor'       => $actor ? [
                    'id'         => $actor->id,
                    'name'       => $actor->name,
                    'email'      => $actor->email,
                    'root_admin' => (bool) ($actor->root_admin ?? false),
                ] : null,
            ];
        });

        return response()->json([
            'data' => $items,
            'pagination' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'per_page'     => $paginated->perPage(),
                'total'        => $paginated->total(),
            ],
            'stats' => [
                'total_logs'   => $totalLogs,
                'auth_count'   => $authCount,
                'vps_count'    => $vpsCount,
                'bolts_count'  => $boltsCount,
                'admin_count'  => $adminCount,
                'unique_users' => $uniqueActors,
                'unique_ips'   => $uniqueIps,
            ],
        ]);
    }
}
