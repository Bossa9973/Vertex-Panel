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
use Convoy\Repositories\Proxmox\Server\ProxmoxActivityRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxBackupRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxPowerRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxServerRepository;
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
        @set_time_limit(240);

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

            // Actively verify and build the VM on the target hypervisor
            try {
                $buildService = app(\Convoy\Services\Servers\ServerBuildService::class);
                $targetTemplate = Template::where('uuid', $templateUuid)->first();

                // Wait up to 30s to see if queue worker started or finished creation
                $created = false;
                $start = time();
                while ((time() - $start) < 30) {
                    if ($buildService->isVmCreated($newServer)) {
                        $created = true;
                        break;
                    }
                    sleep(2);
                }

                // If not created yet via background queue, trigger clone directly
                if (!$created && $targetTemplate) {
                    try {
                        $buildService->build($newServer, $targetTemplate);
                        $start2 = time();
                        while ((time() - $start2) < 45) {
                            if ($buildService->isVmCreated($newServer)) {
                                $created = true;
                                break;
                            }
                            sleep(2);
                        }
                    } catch (\Throwable $directBuildEx) {
                        Log::warning("Direct build attempt note: " . $directBuildEx->getMessage());
                    }
                }

                if ($created) {
                    // Sync network, memory, and disks
                    try {
                        app(\Convoy\Services\Servers\SyncBuildService::class)->handle($newServer);
                    } catch (\Throwable $syncEx) {
                        Log::warning("SyncBuildService warning for new server #{$newServer->id}: " . $syncEx->getMessage());
                    }

                    // Apply root password
                    try {
                        app(\Convoy\Services\Servers\ServerAuthService::class)->updatePassword($newServer, $newPassword);
                    } catch (\Throwable $pwEx) {
                        Log::warning("ServerAuthService warning for new server #{$newServer->id}: " . $pwEx->getMessage());
                    }

                    // Start the new VM on Proxmox
                    try {
                        app(\Convoy\Repositories\Proxmox\Server\ProxmoxPowerRepository::class)
                            ->setServer($newServer)
                            ->send(\Convoy\Enums\Server\PowerAction::START);
                    } catch (\Throwable $pwrEx) {
                        Log::warning("Power start warning for new server #{$newServer->id}: " . $pwrEx->getMessage());
                    }

                    $newServer->update(['status' => null]);
                }
            } catch (\Throwable $buildPipelineEx) {
                Log::warning("Proxmox build pipeline completed with warning: " . $buildPipelineEx->getMessage());
            }
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

        // STEP 4: Decommission & Delete Old VM from Source Hypervisor
        try {
            // First send kill signal to old VM on Proxmox
            try {
                app(\Convoy\Repositories\Proxmox\Server\ProxmoxPowerRepository::class)
                    ->setServer($oldServer)
                    ->send(\Convoy\Enums\Server\PowerAction::KILL);
            } catch (\Throwable $powerKillEx) {
                Log::warning("Old server power kill note: " . $powerKillEx->getMessage());
            }

            // Sleep 2 seconds for hypervisor power state to update
            sleep(2);

            // Delete old VM from Proxmox hypervisor
            try {
                app(\Convoy\Repositories\Proxmox\Server\ProxmoxServerRepository::class)
                    ->setServer($oldServer)
                    ->delete();
            } catch (\Throwable $pveDeleteEx) {
                Log::warning("Old server Proxmox deletion note: " . $pveDeleteEx->getMessage());
            }

            // Detach IP addresses and delete DB record immediately
            $oldServer->addresses()->update(['server_id' => null]);
            $oldServer->delete();
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
        // 1. Fetch all templates available on the target node
        $targetTemplates = Template::whereHas('group', function ($q) use ($targetNode) {
            $q->where('node_id', $targetNode->id);
        })->get();

        if ($targetTemplates->isEmpty()) {
            throw new \RuntimeException("No VM OS templates configured on destination node '{$targetNode->name}'. Please configure a template on this node before relocating.");
        }

        // 2. Try to match the OS based on the old server's name, hostname, or description
        $keywords = ['ubuntu', 'debian', 'almalinux', 'rocky', 'centos', 'alpine', 'windows', 'arch'];
        $oldSearchString = strtolower($oldServer->name . ' ' . $oldServer->hostname . ' ' . $oldServer->description);

        foreach ($keywords as $keyword) {
            if (str_contains($oldSearchString, $keyword)) {
                $matched = $targetTemplates->first(function ($tmpl) use ($keyword) {
                    return str_contains(strtolower($tmpl->name), $keyword);
                });
                if ($matched) {
                    return $matched->uuid;
                }
            }
        }

        // 3. Fallback: pick the first available template on the target node
        return $targetTemplates->first()->uuid;
    }

    /**
     * Wait for a Proxmox background task (UPID) to complete.
     */
    private function waitForTaskCompletion(?Node $node, string $upid, int $maxSeconds = 120): bool
    {
        if (!$node) return false;

        $activityRepo = app(ProxmoxActivityRepository::class);
        $activityRepo->setNode($node);

        $start = time();
        while ((time() - $start) < $maxSeconds) {
            try {
                $status = $activityRepo->getStatus($upid);
                if (isset($status['status']) && $status['status'] === 'stopped') {
                    return isset($status['exitstatus']) && strtolower($status['exitstatus']) === 'ok';
                }
            } catch (\Throwable $e) {
                // Continue waiting
            }
            sleep(3);
        }

        return false;
    }
}
