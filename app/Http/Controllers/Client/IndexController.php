<?php

namespace Convoy\Http\Controllers\Client;

use Convoy\Http\Controllers\ApiController;
use Convoy\Models\Server;
use Convoy\Services\Servers\ServerDetailService;
use Convoy\Transformers\Client\ServerTransformer;
use Illuminate\Http\Request;
use Spatie\QueryBuilder\QueryBuilder;

class IndexController extends ApiController
{
    public function __construct(private ServerDetailService $service)
    {
    }

    public function index(Request $request)
    {
        $user = $request->user();

        $builder = QueryBuilder::for(Server::query())
                               ->with(['addresses', 'node'])
                               ->allowedFilters(['name']);

        $type = $request->input('type');

        if ($type === 'all') {
            if (!$user->root_admin) {
                $builder = $builder->whereRaw('1 = 2');
            }
        } else {
            $builder = $builder->where('servers.user_id', $user->id);
        }

        $servers = $builder->paginate(min($request->query('per_page', 50), 100))->appends(
            $request->query(),
        );

        return fractal($servers, new ServerTransformer())->respond();
    }

    public function announcementStatus()
    {
        $enabled = \Illuminate\Support\Facades\Cache::remember('setting.announcement_row_enabled', 300, function () {
            $setting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'announcement_row_enabled')->first();
            return $setting ? ($setting->value === 'true' || $setting->value === '1') : true;
        });

        return response()->json([
            'success' => true,
            'data' => [
                'enabled' => $enabled,
            ],
        ]);
    }

    public function terminalMode()
    {
        $mode = \Illuminate\Support\Facades\Cache::remember('setting.terminal_console_mode', 300, function () {
            $setting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'terminal_console_mode')->first();
            return $setting && in_array($setting->value, ['both', 'sshx']) ? $setting->value : 'both';
        });

        return response()->json([
            'success' => true,
            'data' => [
                'mode' => $mode,
            ],
        ]);
    }

    public function maintenanceStatus()
    {
        $defaults = [
            'global' => false,
            'dashboard' => false,
            'servers' => false,
            'earn' => false,
            'billing' => false,
            'account' => false,
            'store' => false,
            'tickets' => false,
            'message' => 'This section is currently undergoing scheduled maintenance. Please check back shortly.',
            'estimated_downtime' => null,
            'downtimes' => [],
        ];

        $data = \Illuminate\Support\Facades\Cache::remember('setting.page_maintenance_settings', 120, function () use ($defaults) {
            $setting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'page_maintenance_settings')->first();
            $decoded = $setting ? json_decode($setting->value, true) : null;
            return is_array($decoded) ? array_merge($defaults, $decoded) : $defaults;
        });

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function appInstallStatus()
    {
        $enabled = \Illuminate\Support\Facades\Cache::remember('setting.app_installation_enabled', 300, function () {
            $setting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'app_installation_enabled')->first();
            return $setting ? ($setting->value === 'true' || $setting->value === '1') : true;
        });

        return response()->json([
            'success' => true,
            'data' => [
                'enabled' => $enabled,
            ],
        ]);
    }
}

