<?php

namespace Convoy\Jobs\Pterodactyl;

use Throwable;
use Convoy\Enums\Server\PowerAction;
use Convoy\Models\Node;
use Convoy\Models\PterodactylDeploy;
use Convoy\Models\Server;
use Convoy\Repositories\Eloquent\ServerRepository;
use Convoy\Repositories\Proxmox\ProxmoxNodeRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxConfigRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxPowerRepository;
use Convoy\Services\CloudInitTemplateService;
use Convoy\Services\Servers\ServerBuildService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Provisions Pterodactyl Panel + Wings on an ALREADY-CREATED VM.
 *
 * The normal VPS deploy flow (ServerDeployController → ServerCreationService)
 * already clones the VM and creates the Server record before this job is
 * dispatched. Our job therefore only needs to:
 *
 *   1. Wait until the Proxmox clone finishes (VM becomes queryable).
 *   2. Upload the Pterodactyl cloud-init snippet.
 *   3. Apply cicustom and REGENERATE the cloud-init drive (critical — without
 *      this Proxmox ignores cicustom on cloned VMs).
 *   4. Power the VM on.
 *
 * The VM's install script posts back to /api/deploy/pterodactyl/webhook when
 * finished, which flips status to 'complete'/'failed' and notifies via Discord.
 */
class ProvisionPterodactylVmJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Retry for up to 40 minutes — clone + boot takes time */
    public function retryUntil(): Carbon
    {
        return now()->addMinutes(40);
    }

    public int $timeout = 120;

    public function __construct(protected int $deployId)
    {
    }

    public function handle(
        ServerBuildService       $buildService,
        ProxmoxNodeRepository    $nodeRepo,
        ProxmoxConfigRepository  $configRepo,
        ProxmoxPowerRepository   $powerRepo,
        ServerRepository         $eloquentServerRepo,
        CloudInitTemplateService $templates,
    ): void {
        $deploy = PterodactylDeploy::findOrFail($this->deployId);

        // ── The server was created by ServerDeployController before dispatch ──
        if (is_null($deploy->server_id)) {
            // Unexpected: no server_id yet. Mark failed immediately.
            $deploy->update(['status' => 'failed', 'error' => 'No server record linked to this deploy.']);
            Log::error("ProvisionPterodactylVmJob: deploy #{$deploy->id} has no server_id");
            return;
        }

        /** @var Server $server */
        $server = Server::findOrFail($deploy->server_id);
        $node   = Node::findOrFail($server->node_id);

        // ── Phase 1: Poll until clone is complete ─────────────────────────
        $cloneDone = $buildService->isVmCreated($server);

        if (! $cloneDone) {
            if ($this->attempts() >= 120) {
                // ~10 min at 5s intervals — Proxmox is stuck
                throw new \RuntimeException(
                    "Proxmox clone timed out for deploy #{$deploy->id} (VMID: {$server->vmid})"
                );
            }
            $this->release(5);
            return;
        }

        // ── Phase 2: Upload Pterodactyl cloud-init snippet ────────────────
        $deploy->update(['status' => 'installing']);

        $config      = $deploy->config;   // decrypted by cast
        $snippetFile = "ptero-deploy-{$server->vmid}.yaml";

        $yaml = $templates->render('pterodactyl-full.yml', [
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
            'TIMEZONE'          => $config['timezone'] ?? 'UTC',
            'NODE_NAME'         => $config['node_name'],
            'NODE_MEMORY'       => (string) ($config['node_memory'] ?? 4096),
            'NODE_DISK'         => (string) ($config['node_disk'] ?? 51200),
            'LOCATION_SHORT'    => $config['location_short'],
            'DEPLOY_ID'         => (string) $deploy->id,
            'DEPLOY_SECRET'     => $deploy->deploy_secret,
            'WEBHOOK_URL'       => url('/api/deploy/pterodactyl/webhook'),
            'USE_SSL'           => 'false',
            'ASSUME_SSL'        => 'false',
        ]);

        // Upload to Proxmox local snippets storage
        $nodeRepo->setNode($node)->uploadSnippet($snippetFile, $yaml);

        // ── Phase 3: Apply cicustom AND regenerate cloud-init drive ───────
        // Setting cicustom alone is NOT enough on cloned VMs — Proxmox carries
        // the old cloud-init state forward from the template. We MUST call the
        // regenerate endpoint so the new snippet is actually written into the
        // cloud-init ISO that the VM reads on first boot.
        $configRepo->setServer($server)->update([
            'agent'    => 1,
            'cicustom' => "user=local:snippets/{$snippetFile}",
        ]);

        // Force Proxmox to rebuild the cloud-init drive with the new snippet
        $nodeRepo->setNode($node)->regenerateCloudInit($node->cluster, $server->vmid);

        // ── Phase 4: Power on the VM ──────────────────────────────────────
        $powerRepo->setServer($server)->send(PowerAction::START);

        Log::info("ProvisionPterodactylVmJob: VM {$server->vmid} started for deploy #{$deploy->id}");

        // Status stays 'installing' until the VM's ptero-install.sh finishes
        // and POSTs to /api/deploy/pterodactyl/webhook
    }

    public function failed(Throwable $exception): void
    {
        Log::error("ProvisionPterodactylVmJob failed for deploy #{$this->deployId}: {$exception->getMessage()}", [
            'exception' => $exception,
        ]);

        $deploy = PterodactylDeploy::find($this->deployId);
        if ($deploy) {
            $deploy->update([
                'status' => 'failed',
                'error'  => $exception->getMessage(),
            ]);
        }
    }
}
