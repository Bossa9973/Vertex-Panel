<?php

namespace Convoy\Services\Servers;

use Convoy\Enums\Server\BackupCompressionType;
use Convoy\Enums\Server\BackupMode;
use Convoy\Models\Address;
use Convoy\Models\Node;
use Convoy\Models\Server;
use Convoy\Models\ServerRelocation;
use Convoy\Models\Template;
use Convoy\Models\User;
use Convoy\Repositories\Proxmox\Server\ProxmoxBackupRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxTaskRepository;
use Convoy\Services\Backups\BackupCreationService;
use Convoy\Services\Backups\RestoreFromBackupService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class ServerRelocationService
{
    public function __construct(
        private ServerCreationService $creationService,
        private ServerDeletionService $deletionService,
    ) {
    }

    /**
     * Executes the full relocation pipeline from source node to target node.
     */
    public function handle(
        Server $oldServer,
        Node $targetNode,
        string $adminDiscordId,
        string $userDiscordId
    ): array {
        // Pre-flight validation
        if ($oldServer->node_id === $targetNode->id) {
            throw new \InvalidArgumentException("Target node '{$targetNode->name}' is identical to the current hosting node.");
        }

        // Scenario 3: Target node has inbound relocations disabled
        if (isset($targetNode->allow_relocation) && $targetNode->allow_relocation === false) {
            throw new \InvalidArgumentException("Target node '{$targetNode->name}' is currently closed to inbound VM relocations.");
        }

        $user = $oldServer->user;
        if (!$user) {
            throw new \RuntimeException("Server #{$oldServer->id} has no valid owner.");
        }

        $sourceNode = $oldServer->node;

        // Capture original server metadata
        // CRITICAL: Original expires_at must be strictly preserved under ALL circumstances
        $originalExpiresAt = $oldServer->expires_at
            ? ($oldServer->expires_at instanceof Carbon ? $oldServer->expires_at : Carbon::parse($oldServer->expires_at))
            : Carbon::now()->addDays(30);

        $planTier     = $oldServer->plan_tier ?? 'free';
        $oldName      = $oldServer->name;
        $oldHostname  = $oldServer->hostname;
        $oldDesc      = $oldServer->description;
        $cpuCores     = (float) $oldServer->cpu;
        $memoryBytes  = (int) $oldServer->memory;
        $diskBytes    = (int) $oldServer->disk;
        $templateUuid = $this->resolveTemplateUuid($oldServer, $targetNode);

        // Determine IP address handling: can we reuse the same IP or must we allocate new?
        $oldIpRecord = $oldServer->addresses()->first();
        $oldIp       = $oldIpRecord ? $oldIpRecord->address : ($sourceNode?->fqdn ?? 'N/A');
        $reusedIp    = false;
        $assignedAddressIds = [];

        if ($oldIpRecord) {
            // Check if target node shares this address pool
            $targetSharesPool = DB::table('address_pool_to_node')
                ->where('node_id', $targetNode->id)
                ->where('address_pool_id', $oldIpRecord->address_pool_id)
                ->exists();

            if ($targetSharesPool) {
                // We can seamlessly reuse the IP on the new node
                $reusedIp = true;
                $assignedAddressIds = [$oldIpRecord->id];
                // Detach from old server so creation service can bind it to the new server
                $oldIpRecord->update(['server_id' => null]);
            }
        }

        if (!$reusedIp) {
            // Pick an available IP on target node's address pools
            $freeAddress = Address::whereNull('server_id')
                ->whereIn('address_pool_id', function ($q) use ($targetNode) {
                    $q->select('address_pool_id')
                      ->from('address_pool_to_node')
                      ->where('node_id', $targetNode->id);
                })
                ->first();

            if ($freeAddress) {
                $assignedAddressIds = [$freeAddress->id];
            }
        }

        // Initialize relocation tracking record
        $relocationRecord = ServerRelocation::create([
            'user_id'          => $user->id,
            'old_server_id'    => $oldServer->id,
            'source_node_id'   => $sourceNode?->id ?? $oldServer->node_id,
            'target_node_id'   => $targetNode->id,
            'server_name'      => $oldName,
            'status'           => 'backing_up',
            'reused_ip'        => $reusedIp,
            'old_ip'           => $oldIp,
            'admin_discord_id' => $adminDiscordId,
            'user_discord_id'  => $userDiscordId,
            'old_expires_at'   => $originalExpiresAt,
        ]);

        // STEP 1: Attempt Proxmox Snapshot/Backup of the source VM
        $backupSuccess = false;
        $backupModel   = null;

        try {
            /** @var BackupCreationService $backupService */
            $backupService = app(BackupCreationService::class);
            $backupName = 'relocation_' . date('Ymd_His');

            // Force allow backup even if backup_limit reached on source server
            $origLimit = $oldServer->backup_limit;
            if ($origLimit !== null && $origLimit === 0) {
                $oldServer->update(['backup_limit' => 5]);
            }

            $backupModel = $backupService->create(
                $oldServer,
                $backupName,
                BackupMode::SNAPSHOT,
                BackupCompressionType::ZSTD
            );

            if ($backupModel && !empty($backupModel->upid)) {
                $backupSuccess = $this->waitForTaskCompletion($sourceNode, $backupModel->upid, 120);
            }
        } catch (\Throwable $e) {
            Log::warning("Relocation backup creation step failed for server #{$oldServer->id}: " . $e->getMessage() . " — continuing with fresh OS fallback.");
            $backupSuccess = false;
        }

        $relocationRecord->update([
            'backup_success' => $backupSuccess,
            'status'         => 'provisioning',
        ]);

        // STEP 2: Provision New VM on Target Node
        $newPassword = Str::random(16);
        $newServer   = null;

        $serverData = [
            'node_id'              => $targetNode->id,
            'user_id'              => $user->id,
            'name'                 => $oldName,
            'hostname'             => $oldHostname ?: 'vps-' . Str::lower(Str::random(6)),
            'vmid'                 => null,
            'limits'               => [
                'cpu'         => (int) $cpuCores,
                'memory'      => $memoryBytes,
                'disk'        => $diskBytes,
                'snapshots'   => (int) ($oldServer->snapshot_limit ?? 0),
                'backups'     => $oldServer->backup_limit,
                'bandwidth'   => $oldServer->bandwidth_limit,
                'address_ids' => $assignedAddressIds,
            ],
            'account_password'     => $newPassword,
            'should_create_server' => true,
            'template_uuid'        => $templateUuid,
            'start_on_completion'  => true,
            'plan_tier'            => 'paid', // Bypasses resource quota conflict during relocation
        ];

        try {
            /** @var Server $newServer */
            $newServer = $this->creationService->handle($serverData);

            // CRITICAL: Strictly preserve original expiration date & plan tier under all conditions
            $newServer->expires_at  = $originalExpiresAt;
            $newServer->plan_tier   = $planTier;
            $newServer->description = $oldDesc ?: "Relocated VPS from {$sourceNode?->name} to {$targetNode->name}";
            $newServer->save();
        } catch (\Throwable $createEx) {
            Log::error("Relocation VM creation failed on target node {$targetNode->name}: " . $createEx->getMessage());

            // If creation failed and we stole the IP address, restore it back to old server
            if ($reusedIp && $oldIpRecord) {
                $oldIpRecord->update(['server_id' => $oldServer->id]);
            }

            $relocationRecord->update([
                'status' => 'failed',
                'error'  => 'Provisioning on target node failed: ' . $createEx->getMessage(),
            ]);

            throw new \RuntimeException("Failed to provision new VM on target node: " . $createEx->getMessage(), 0, $createEx);
        }

        $newIpRecord = $newServer->addresses()->first();
        $newIp       = $newIpRecord ? $newIpRecord->address : $targetNode->fqdn;

        $relocationRecord->update([
            'new_server_id' => $newServer->id,
            'new_ip'        => $newIp,
            'status'        => $backupSuccess ? 'restoring' : 'completed',
        ]);

        // STEP 3: Attempt Backup Restoration if Backup Succeeded
        $restoreSuccess = false;
        if ($backupSuccess && $backupModel) {
            try {
                /** @var RestoreFromBackupService $restoreService */
                $restoreService = app(RestoreFromBackupService::class);
                $restoreService->handle($newServer, $backupModel);
                $restoreSuccess = true;
            } catch (\Throwable $restoreEx) {
                Log::warning("Relocation backup restoration step skipped/failed on new server #{$newServer->id}: " . $restoreEx->getMessage() . " — keeping fresh OS install.");
                $restoreSuccess = false;
            }
        }

        // STEP 4: Decommission / Wipe Old VM from Source Node
        // Immediate UI and DB wipe so user never has orphan / quota lock, async hypervisor delete
        try {
            $oldServer->addresses()->update(['server_id' => null]);
            $this->deletionService->handle($oldServer, true); // noPurge = true performs instant wipe
        } catch (\Throwable $delEx) {
            Log::warning("Old server standard deletion failed during relocation: " . $delEx->getMessage() . " — wiping DB record.");
            $oldServer->addresses()->update(['server_id' => null]);
            $oldServer->delete();
        }

        // STEP 5: Finalize Record & Activity Logging
        $relocationRecord->update([
            'status' => 'completed',
        ]);

        try {
            \Convoy\Facades\Activity::event('bolts:server-relocate')
                ->actor($user)
                ->subject($newServer)
                ->description("Relocated VPS '{$newServer->name}' from {$sourceNode?->name} ({$oldIp}) to {$targetNode->name} ({$newIp})")
                ->property([
                    'old_server_id'     => $oldServer->id,
                    'new_server_id'     => $newServer->id,
                    'source_node'       => $sourceNode?->name,
                    'target_node'       => $targetNode->name,
                    'old_ip'            => $oldIp,
                    'new_ip'            => $newIp,
                    'reused_ip'         => $reusedIp,
                    'backup_success'    => $backupSuccess,
                    'restore_success'   => $restoreSuccess,
                    'expires_at'        => $newServer->expires_at->toIso8601String(),
                    'admin_discord_id'  => $adminDiscordId,
                ])
                ->log();
        } catch (\Throwable $e) {}

        return [
            'ok'               => true,
            'relocation_id'    => $relocationRecord->id,
            'server_name'      => $newServer->name,
            'old_server_id'    => $oldServer->id,
            'new_server_id'    => $newServer->id,
            'source_node_name' => $sourceNode?->name ?? 'Node A',
            'target_node_name' => $targetNode->name,
            'old_ip'           => $oldIp,
            'new_ip'           => $newIp,
            'reused_ip'        => $reusedIp,
            'backup_success'   => $backupSuccess,
            'restore_success'  => $restoreSuccess,
            'new_password'     => (!$backupSuccess || !$restoreSuccess) ? $newPassword : null,
            'expires_at'       => $newServer->expires_at->toIso8601String(),
        ];
    }

    /**
     * Resolves an equivalent OS template UUID on the target node.
     */
    private function resolveTemplateUuid(Server $oldServer, Node $targetNode): string
    {
        // Try finding matching template on target node by name/group
        $oldTemplate = null;
        if (!empty($oldServer->template_id)) {
            $oldTemplate = Template::find($oldServer->template_id);
        }

        if ($oldTemplate) {
            $matchingTargetTemplate = Template::whereHas('group', function ($q) use ($targetNode) {
                $q->where('node_id', $targetNode->id);
            })->where('name', $oldTemplate->name)->first();

            if ($matchingTargetTemplate) {
                return $matchingTargetTemplate->uuid;
            }
        }

        // Fallback 1: pick any active template for the target node
        $fallbackTemplate = Template::whereHas('group', function ($q) use ($targetNode) {
            $q->where('node_id', $targetNode->id);
        })->first();

        if ($fallbackTemplate) {
            return $fallbackTemplate->uuid;
        }

        // Fallback 2: Global fallback to any template in the system
        $anyTemplate = Template::firstOrFail();
        return $anyTemplate->uuid;
    }

    /**
     * Wait for a Proxmox background task (UPID) to complete.
     */
    private function waitForTaskCompletion(?Node $node, string $upid, int $maxSeconds = 120): bool
    {
        if (!$node) return false;

        $taskRepo = app(ProxmoxTaskRepository::class);
        $taskRepo->setNode($node);

        $start = time();
        while ((time() - $start) < $maxSeconds) {
            try {
                $status = $taskRepo->getTaskStatus($upid);
                if (isset($status['status']) && $status['status'] === 'stopped') {
                    return isset($status['exitstatus']) && $status['exitstatus'] === 'OK';
                }
            } catch (\Throwable $e) {
                // Continue waiting
            }
            sleep(3);
        }

        return false;
    }
}
