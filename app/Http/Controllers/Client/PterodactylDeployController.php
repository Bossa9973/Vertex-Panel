<?php

namespace Convoy\Http\Controllers\Client;

use Throwable;
use Illuminate\Http\JsonResponse;
use Convoy\Http\Controllers\Controller;
use Convoy\Http\Requests\StorePterodactylDeployRequest;
use Convoy\Jobs\Pterodactyl\ProvisionPterodactylVmJob;
use Convoy\Models\PterodactylDeploy;
use Convoy\Services\CloudInitTemplateService;
use Convoy\Helpers\PasswordHelper;

class PterodactylDeployController extends Controller
{
    public function __construct(
        private CloudInitTemplateService $templates,
    ) {}

    /**
     * Accept a Pterodactyl deploy request, persist config, validate template
     * rendering, and dispatch the async provisioning job.
     *
     * Returns { deploy_id } immediately — the client polls show() for progress.
     */
    public function store(StorePterodactylDeployRequest $request): JsonResponse
    {
        $appInstallSetting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'app_installation_enabled')->first();
        $appInstallEnabled = $appInstallSetting ? ($appInstallSetting->value === 'true' || $appInstallSetting->value === '1') : true;
        if (!$appInstallEnabled) {
            return response()->json([
                'message' => 'Application auto-installation is currently disabled by the administrator.',
            ], 403);
        }

        $validated = $request->validated();

        // ── Generate any passwords the client left blank ──────────────────
        $config = array_merge($validated, [
            'admin_password'    => $validated['admin_password']    ?? PasswordHelper::generate(),
            'db_password'       => $validated['db_password']       ?? PasswordHelper::generate(),
            'db_root_password'  => PasswordHelper::generate(),     // never from client
            'wings_db_password' => PasswordHelper::generate(),
            'timezone'          => $validated['timezone'] ?? 'UTC',
        ]);

        // ── Per-deploy webhook secret — 64 random hex chars ───────────────
        // NOT the BotApiSecret. Generated fresh, never reused.
        $deploySecret = bin2hex(random_bytes(32));

        // ── Write DB record BEFORE any Proxmox call ───────────────────────
        // If Proxmox fails we still have the record and can show the error.
        $deploy = PterodactylDeploy::create([
            'user_id'       => $request->user()->id,
            'status'        => 'pending',
            'deploy_secret' => $deploySecret,
            'config'        => $config,          // encrypted at rest by cast
            'panel_fqdn'    => $config['panel_fqdn'],
            'wings_fqdn'    => $config['wings_fqdn'],
        ]);

        // ── Validate template early (hard-fail before job dispatch) ───────
        // Catches misconfigured templates immediately instead of letting
        // the background job fail silently 10 minutes later.
        try {
            $this->templates->render('pterodactyl-full.yml', [
                'PANEL_FQDN'        => $config['panel_fqdn'],
                'WINGS_FQDN'        => $config['wings_fqdn'],
                'CF_TUNNEL_TOKEN'   => $config['cf_tunnel_token'],
                'ADMIN_EMAIL'       => $config['admin_email'],
                'ADMIN_USERNAME'    => $config['admin_username'],
                'ADMIN_FIRSTNAME'   => $config['admin_firstname'],
                'ADMIN_LASTNAME'    => $config['admin_lastname'],
                'ADMIN_PASSWORD'    => $config['admin_password'],
                'DB_PASSWORD'       => $config['db_password'],
                'DB_ROOT_PASSWORD'  => $config['db_root_password'],
                'TIMEZONE'          => $config['timezone'],
                'NODE_NAME'         => $config['node_name'],
                'NODE_MEMORY'       => (string) $config['node_memory'],
                'NODE_DISK'         => (string) $config['node_disk'],
                'LOCATION_SHORT'    => $config['location_short'],
                'DEPLOY_ID'         => (string) $deploy->id,
                'DEPLOY_SECRET'     => $deploySecret,
                'WEBHOOK_URL'       => url('/api/deploy/pterodactyl/webhook'),
                'USE_SSL'           => 'false',
                'ASSUME_SSL'        => 'false',
            ]);
        } catch (Throwable $e) {
            $deploy->update(['status' => 'failed', 'error' => $e->getMessage()]);
            return response()->json(['error' => $e->getMessage()], 422);
        }

        // ── Dispatch provisioning job ─────────────────────────────────────
        // Job handles: Proxmox clone → poll until ready → upload pterodactyl
        // cloud-init snippet → power on VM.
        // When the VM's install script finishes it POSTs to the webhook
        // (/api/deploy/pterodactyl/webhook), which flips status to 'complete'
        // and fires the PterodactylDeployComplete notification.
        ProvisionPterodactylVmJob::dispatch($deploy->id)
            ->onQueue('default');

        return response()->json(['deploy_id' => $deploy->id], 202);
    }

    /**
     * Return deploy status (and credentials only once complete).
     * Called by the React poller every 10 seconds.
     */
    public function show(PterodactylDeploy $deploy): JsonResponse
    {
        // Ownership check — clients can only read their own deploys
        abort_unless($deploy->user_id === auth()->id(), 403);

        $data = [
            'status'     => $deploy->status,
            'panel_fqdn' => $deploy->panel_fqdn,
            'wings_fqdn' => $deploy->wings_fqdn,
            'error'      => $deploy->error,
        ];

        // Reveal credentials only when complete — never during install
        if ($deploy->status === 'complete') {
            $creds = $deploy->credentials;
            $data['credentials'] = [
                'panel_url'      => $creds['panel_url'],
                'admin_email'    => $creds['admin_email'],
                'admin_password' => $creds['admin_password'],
                'node_id'        => $creds['node_id'],
                'node_status'    => $creds['node_status'],
            ];
        }

        return response()->json($data);
    }
}
