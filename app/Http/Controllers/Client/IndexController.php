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
                               ->with(['addresses'])
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
        $setting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'announcement_row_enabled')->first();
        $enabled = $setting ? ($setting->value === 'true' || $setting->value === '1') : true;

        return response()->json([
            'success' => true,
            'data' => [
                'enabled' => $enabled,
            ],
        ]);
    }

    public function terminalMode()
    {
        $setting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'terminal_console_mode')->first();
        $mode = $setting && in_array($setting->value, ['both', 'sshx']) ? $setting->value : 'both';

        return response()->json([
            'success' => true,
            'data' => [
                'mode' => $mode,
            ],
        ]);
    }

    public function maintenanceStatus()
    {
        $setting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'page_maintenance_settings')->first();
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

        $data = $setting ? json_decode($setting->value, true) : $defaults;
        if (!is_array($data)) {
            $data = $defaults;
        }

        return response()->json([
            'success' => true,
            'data' => array_merge($defaults, $data),
        ]);
    }

    public function appInstallStatus()
    {
        $setting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'app_installation_enabled')->first();
        $enabled = $setting ? ($setting->value === 'true' || $setting->value === '1') : true;

        return response()->json([
            'success' => true,
            'data' => [
                'enabled' => $enabled,
            ],
        ]);
    }
}

