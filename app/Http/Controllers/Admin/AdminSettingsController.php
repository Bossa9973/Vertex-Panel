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

        try {
            \Convoy\Facades\Activity::event('admin:announcement-toggle')
                ->actor($request->user())
                ->description("Admin " . ($enabled ? 'enabled' : 'disabled') . " announcement banner")
                ->property(['enabled' => $enabled])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

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

        try {
            \Convoy\Facades\Activity::event('admin:terminal-mode-update')
                ->actor($request->user())
                ->description("Admin updated terminal console mode to '{$mode}'")
                ->property(['mode' => $mode])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

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
            'estimated_downtime' => 'nullable|string|max:255',
            'downtimes' => 'nullable|array',
        ]);

        $setting = DB::table('settings')->where('key', 'page_maintenance_settings')->first();
        $current = $setting ? json_decode($setting->value, true) : [];
        if (!is_array($current)) {
            $current = [];
        }

        $updated = array_merge($current, $payload);

        DB::table('settings')->updateOrInsert(
            ['key' => 'page_maintenance_settings'],
            [
                'value' => json_encode($updated),
                'updated_at' => now(),
            ]
        );

        try {
            \Convoy\Facades\Activity::event('admin:maintenance-toggle')
                ->actor($request->user())
                ->description("Admin updated maintenance mode settings")
                ->property(['settings' => $updated])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

        return response()->json([
            'success' => true,
            'message' => 'Page maintenance settings updated successfully.',
            'data' => $updated,
        ]);
    }

    public function getCreditsSettings()
    {
        $topup = DB::table('settings')->where('key', 'credits_topup_enabled')->first();
        $referral = DB::table('settings')->where('key', 'credits_referral_enabled')->first();

        return response()->json([
            'success' => true,
            'data' => [
                'topup_enabled' => $topup ? ($topup->value === 'true' || $topup->value === '1') : true,
                'referral_enabled' => $referral ? ($referral->value === 'true' || $referral->value === '1') : true,
            ],
        ]);
    }

    public function updateCreditsSettings(Request $request)
    {
        $request->validate([
            'topup_enabled' => 'required|boolean',
            'referral_enabled' => 'required|boolean',
        ]);

        $topup = (bool) $request->input('topup_enabled');
        $referral = (bool) $request->input('referral_enabled');

        DB::table('settings')->updateOrInsert(
            ['key' => 'credits_topup_enabled'],
            [
                'value' => $topup ? 'true' : 'false',
                'updated_at' => now(),
            ]
        );

        DB::table('settings')->updateOrInsert(
            ['key' => 'credits_referral_enabled'],
            [
                'value' => $referral ? 'true' : 'false',
                'updated_at' => now(),
            ]
        );

        try {
            \Convoy\Facades\Activity::event('admin:credits-settings-update')
                ->actor($request->user())
                ->description("Admin updated credits settings (Top-Up: " . ($topup ? 'ON' : 'OFF') . ", Referral: " . ($referral ? 'ON' : 'OFF') . ")")
                ->property(['topup_enabled' => $topup, 'referral_enabled' => $referral])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

        return response()->json([
            'success' => true,
            'message' => 'Credits settings updated successfully.',
            'data' => [
                'topup_enabled' => $topup,
                'referral_enabled' => $referral,
            ],
        ]);
    }

    public function getAppInstallSetting()
    {
        $setting = DB::table('settings')->where('key', 'app_installation_enabled')->first();
        $enabled = $setting ? ($setting->value === 'true' || $setting->value === '1') : true;

        return response()->json([
            'success' => true,
            'data' => [
                'enabled' => $enabled,
            ],
        ]);
    }

    public function updateAppInstallSetting(Request $request)
    {
        $request->validate([
            'enabled' => 'required|boolean',
        ]);

        $enabled = (bool) $request->input('enabled');

        DB::table('settings')->updateOrInsert(
            ['key' => 'app_installation_enabled'],
            [
                'value' => $enabled ? 'true' : 'false',
                'updated_at' => now(),
            ]
        );

        try {
            \Convoy\Facades\Activity::event('admin:app-install-toggle')
                ->actor($request->user())
                ->description("Admin " . ($enabled ? 'enabled' : 'disabled') . " 1-click app auto-installation")
                ->property(['enabled' => $enabled])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

        return response()->json([
            'success' => true,
            'message' => 'App auto-installation setting updated.',
            'data' => [
                'enabled' => $enabled,
            ],
        ]);
    }

    public function getEarnAwardsSettings()
    {
        $setting = DB::table('settings')->where('key', 'earn_awards_settings')->first();
        $defaults = [
            'invites_enabled' => true,
            'boosts_enabled' => true,
            'messages_enabled' => true,
            'disabled_tasks' => [],
        ];

        $data = $setting ? json_decode($setting->value, true) : $defaults;
        if (!is_array($data)) {
            $data = $defaults;
        }

        $allTasks = [
            ['key' => 'invites_15', 'title' => '15 Discord Invites', 'category' => 'invites', 'requirement_text' => 'Invite 15 members to our Discord server', 'target_count' => 15, 'reward_bolts' => 3000],
            ['key' => 'invites_25', 'title' => '25 Discord Invites', 'category' => 'invites', 'requirement_text' => 'Invite 25 members to our Discord server', 'target_count' => 25, 'reward_bolts' => 5000],
            ['key' => 'boost_1', 'title' => '1 Server Boost', 'category' => 'boosts', 'requirement_text' => 'Boost our Discord server 1 time', 'target_count' => 1, 'reward_bolts' => 3000],
            ['key' => 'boost_2', 'title' => '2 Server Boosts', 'category' => 'boosts', 'requirement_text' => 'Boost our Discord server 2 times', 'target_count' => 2, 'reward_bolts' => 5000],
            ['key' => 'messages_200', 'title' => '200 Messages Sent', 'category' => 'messages', 'requirement_text' => 'Send 200 messages in Discord chat channels', 'target_count' => 200, 'reward_bolts' => 3000],
            ['key' => 'messages_300', 'title' => '300 Messages Sent', 'category' => 'messages', 'requirement_text' => 'Send 300 messages in Discord chat channels', 'target_count' => 300, 'reward_bolts' => 3000],
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'invites_enabled' => (bool) ($data['invites_enabled'] ?? true),
                'boosts_enabled' => (bool) ($data['boosts_enabled'] ?? true),
                'messages_enabled' => (bool) ($data['messages_enabled'] ?? true),
                'disabled_tasks' => is_array($data['disabled_tasks'] ?? null) ? $data['disabled_tasks'] : [],
                'available_tasks' => $allTasks,
            ],
        ]);
    }

    public function updateEarnAwardsSettings(Request $request)
    {
        $request->validate([
            'invites_enabled' => 'required|boolean',
            'boosts_enabled' => 'required|boolean',
            'messages_enabled' => 'required|boolean',
            'disabled_tasks' => 'nullable|array',
            'disabled_tasks.*' => 'string',
        ]);

        $payload = [
            'invites_enabled' => (bool) $request->input('invites_enabled'),
            'boosts_enabled' => (bool) $request->input('boosts_enabled'),
            'messages_enabled' => (bool) $request->input('messages_enabled'),
            'disabled_tasks' => array_values(array_unique((array) $request->input('disabled_tasks', []))),
        ];

        DB::table('settings')->updateOrInsert(
            ['key' => 'earn_awards_settings'],
            [
                'value' => json_encode($payload),
                'updated_at' => now(),
            ]
        );

        try {
            \Convoy\Facades\Activity::event('admin:earn-awards-update')
                ->actor($request->user())
                ->description("Admin updated /earn community awards configuration")
                ->property(['settings' => $payload])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

        return response()->json([
            'success' => true,
            'message' => 'Earn awards settings updated successfully.',
            'data' => $payload,
        ]);
    }
}

