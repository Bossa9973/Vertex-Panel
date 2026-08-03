<?php

namespace Convoy\Http\Controllers\Admin;

use Convoy\Http\Controllers\ApiController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminSettingsController extends ApiController
{
    public function getAnnouncementSetting()
    {
        $setting = DB::table('settings')->where('key', 'announcement_row_enabled')->first();
        $enabled = $setting ? ($setting->value === 'true' || $setting->value === '1') : true;

        return response()->json([
            'success' => true,
            'data' => [
                'enabled' => $enabled,
            ],
        ]);
    }

    public function updateAnnouncementSetting(Request $request)
    {
        $request->validate([
            'enabled' => 'required|boolean',
        ]);

        $enabled = (bool) $request->input('enabled');

        DB::table('settings')->updateOrInsert(
            ['key' => 'announcement_row_enabled'],
            [
                'value' => $enabled ? 'true' : 'false',
                'updated_at' => now(),
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Announcement row visibility updated.',
            'data' => [
                'enabled' => $enabled,
            ],
        ]);
    }

    public function getTerminalSetting()
    {
        $setting = DB::table('settings')->where('key', 'terminal_console_mode')->first();
        $mode = $setting && in_array($setting->value, ['both', 'sshx']) ? $setting->value : 'both';

        return response()->json([
            'success' => true,
            'data' => [
                'mode' => $mode,
            ],
        ]);
    }

    public function updateTerminalSetting(Request $request)
    {
        $request->validate([
            'mode' => 'required|string|in:both,sshx',
        ]);

        $mode = $request->input('mode');

        DB::table('settings')->updateOrInsert(
            ['key' => 'terminal_console_mode'],
            [
                'value' => $mode,
                'updated_at' => now(),
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Terminal console mode updated successfully.',
            'data' => [
                'mode' => $mode,
            ],
        ]);
    }

    public function getMaintenanceSettings()
    {
        $setting = DB::table('settings')->where('key', 'page_maintenance_settings')->first();
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

    public function updateMaintenanceSettings(Request $request)
    {
        $payload = $request->validate([
            'global' => 'nullable|boolean',
            'dashboard' => 'nullable|boolean',
            'servers' => 'nullable|boolean',
            'earn' => 'nullable|boolean',
            'billing' => 'nullable|boolean',
            'account' => 'nullable|boolean',
            'store' => 'nullable|boolean',
            'tickets' => 'nullable|boolean',
            'message' => 'nullable|string|max:500',
        ]);

        $setting = DB::table('settings')->where('key', 'page_maintenance_settings')->first();
        $current = $setting ? json_decode($setting->value, true) : [];
        if (!is_array($current)) {
            $current = [];
        }

        $updated = array_merge($current, array_filter($payload, fn($val) => $val !== null));

        DB::table('settings')->updateOrInsert(
            ['key' => 'page_maintenance_settings'],
            [
                'value' => json_encode($updated),
                'updated_at' => now(),
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'Page maintenance settings updated successfully.',
            'data' => $updated,
        ]);
    }
}
