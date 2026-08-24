<?php

namespace Convoy\Jobs\Pterodactyl;

use Throwable;
use Convoy\Enums\Server\PowerAction;
use Convoy\Enums\Server\Status;
use Convoy\Helpers\PasswordHelper;
use Convoy\Models\Node;
use Convoy\Models\PterodactylDeploy;
use Convoy\Models\Server;
use Convoy\Models\Template;
use Convoy\Repositories\Eloquent\ServerRepository;
use Convoy\Repositories\Proxmox\ProxmoxNodeRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxConfigRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxPowerRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxServerRepository;
use Convoy\Services\CloudInitTemplateService;
use Convoy\Services\Servers\ServerBuildService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Provisions a VM for a Pterodactyl auto-deploy order.
 *
 * Design decision — this job is a SELF-RELEASING poller rather than a job chain.
 * Reason: job chains don't handle "wait and retry" semantics well for Proxmox clone tasks
 * which can take 30–180 seconds. Instead we:
 *   1. On attempt 1: clone the VM, upload cloud-init snippet, start VM. Release and wait.
 *   2. On subsequent attempts: check if clone is done, then upload snippet + start.
 *      This is exactly what WaitUntilVmIsCreatedJob does for normal VMs.
 *
 * If anything fails, we mark the deploy as 'failed' so the webhook never fires and
 * the user gets a clear error message via the status poll endpoint.
 */
class ProvisionPterodactylVmJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Retry for up to 40 minutes — clone + install takes time */
    public function retryUntil(): Carbon
    {
        return now()->addMinutes(40);
    }

    public int $timeout = 120;

    public function __construct(protected int $deployId)
    {
    }

    public function handle(
        ServerBuildService     $buildService,
        ProxmoxServerRepository $serverRepo,
        ProxmoxNodeRepository   $nodeRepo,
        ProxmoxConfigRepository $configRepo,
        ProxmoxPowerRepository  $powerRepo,
        ServerRepository        $eloquentServerRepo,
        CloudInitTemplateService $templates,
    ): void {
        $deploy = PterodactylDeploy::findOrFail($this->deployId);

        // ── Resolve node and template ─────────────────────────────────────
        $nodeId     = config('convoy.pterodactyl.default_node_id');
        $templateVmid = config('convoy.pterodactyl.template_vmid');

        /** @var Node $node */
        $node = Node::findOrFail($nodeId);

        /** @var Template $template */
        $template = Template::where('vmid', $templateVmid)
                            ->whereHas('group', fn ($q) => $q->where('node_id', $node->id))
                            ->firstOrFail();

        // ── Phase 1: Create a Server record and kick off VM clone ─────────
        // Only run on the FIRST attempt (server_id is null before that).
        if (is_null($deploy->server_id)) {
            $deploy->update(['status' => 'provisioning']);

            // Generate a unique VMID for this node
            $vmid = $this->generateUniqueVmid($node->id, $eloquentServerRepo);

            $uuid  = Str::uuid()->toString();
            $short = substr($uuid, 0, 8);

            // Panel FQDN doubles as hostname — safe alphanum+dots+hyphen
            $hostname = $deploy->panel_fqdn ?? "ptero-{$deploy->id}.local";

            /** @var Server $server */
            $server = Server::create([
                'uuid'          => $uuid,
                'uuid_short'    => $short,
                'status'        => Status::INSTALLING->value,
                'name'          => "ptero-deploy-{$deploy->id}",
                'user_id'       => $deploy->user_id,
                'node_id'       => $node->id,
                'vmid'          => $vmid,
                'hostname'      => $hostname,
                // Minimal spec — the pterodactyl template VM defines the real disk
                'cpu'           => 4,
                'memory'        => 4096 * 1024 * 1024,  // 4 GiB in bytes (MebibytesToAndFromBytes cast)
                'disk'          => 20 * 1024 * 1024 * 1024, // 20 GiB in bytes
                'snapshot_limit'=> 0,
                'backup_limit'  => 0,
                'bandwidth_limit'=> 0,
            ]);

            $deploy->update(['server_id' => $server->id, 'vmid' => $vmid]);

            // Kick off the Proxmox clone asynchronously (returns a task UPID)
            $serverRepo->setServer($server)->create($template);

            // Release and come back in 5 seconds to poll clone status
            $this->release(5);
            return;
        }

        // ── Phase 2: Poll until clone is complete ─────────────────────────
        /** @var Server $server */
        $server = Server::findOrFail($deploy->server_id);

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

        // ── Phase 3: Upload Pterodactyl cloud-init snippet ────────────────
        $deploy->update(['status' => 'installing']);

        $config = $deploy->config;  // decrypted by cast

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

        // Set cicustom on the VM — cloud-init will run our script on first boot
        $configRepo->setServer($server)->update([
            'agent'    => 1,
            'cicustom' => "user=local:snippets/{$snippetFile}",
        ]);

        // ── Phase 4: Power on the VM ──────────────────────────────────────
        $powerRepo->setServer($server)->send(PowerAction::START);

        Log::info("ProvisionPterodactylVmJob: VM {$server->vmid} started for deploy #{$deploy->id}");

        // Status stays 'installing' — the VM's /usr/local/bin/ptero-callback.sh
        // will POST back to /api/deploy/pterodactyl/webhook when done,
        // which flips status to 'complete' or 'failed' and fires the notification.
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

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function generateUniqueVmid(int $nodeId, ServerRepository $repo): int
    {
        $vmid     = random_int(100, 999999999);
        $attempts = 0;

        while (! $repo->isUniqueVmId($nodeId, $vmid)) {
            $vmid = random_int(100, 999999999);
            if ($attempts++ > 10) {
                throw new \RuntimeException('Could not generate a unique VMID');
            }
        }

        return $vmid;
    }
}
