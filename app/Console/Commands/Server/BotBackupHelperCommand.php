<?php

namespace Convoy\Console\Commands\Server;

use Convoy\Enums\Server\BackupCompressionType;
use Convoy\Enums\Server\BackupMode;
use Convoy\Exceptions\Service\Backup\TooManyBackupsException;
use Convoy\Jobs\Server\UploadBackupToCloudJob;
use Convoy\Models\Backup;
use Convoy\Models\Node;
use Convoy\Models\Server;
use Convoy\Models\User;
use Convoy\Services\Backups\BackupCreationService;
use Convoy\Services\Backups\BackupMonitorService;
use Convoy\Services\Backups\BackupUploadDiagnosticService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Throwable;

/**
 * Helper command designed for Discord Bot integration.
 * Provides JSON-driven node queries, user VM discovery, and instant multi-VM cloud backups.
 *
 * Usage:
 *   php artisan server:bot-helper list-nodes
 *   php artisan server:bot-helper get-user-vms --user=123456789012345678
 *   php artisan server:bot-helper backup-vms --servers=382,381 --sync
 *   php artisan server:bot-helper backup-bulk --node=4 --tier=all --sync
 */
class BotBackupHelperCommand extends Command
{
    protected $signature = 'server:bot-helper
                            {action : Action to perform: list-nodes, get-user-vms, backup-vms, backup-bulk}
                            {--user= : User Discord ID, User ID, or email address}
                            {--node= : Filter by Node ID}
                            {--tier=all : Filter by plan tier: all, paid, free}
                            {--servers= : Comma-separated list of server IDs to back up}
                            {--name= : Custom backup name}
                            {--force : Force backup bypassing constraints}
                            {--sync : Wait and immediately stream backups to Google Drive}
                            {--json : Force JSON output format}';

    protected $aliases = ['p:server:bot-helper'];

    protected $description = 'JSON & CLI helper for Discord bot backup management and instant cloud uploads.';

    public function __construct(
        private BackupCreationService $backupCreationService,
        private BackupMonitorService $monitorService,
        private BackupUploadDiagnosticService $diagnosticService
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $action = trim($this->argument('action'));

        try {
            return match ($action) {
                'list-nodes'   => $this->handleListNodes(),
                'get-user-vms' => $this->handleGetUserVms(),
                'backup-vms'   => $this->handleBackupVms(),
                'backup-bulk'  => $this->handleBackupBulk(),
                default        => $this->errorJson("Unknown action: '{$action}'. Supported: list-nodes, get-user-vms, backup-vms, backup-bulk"),
            };
        } catch (Throwable $e) {
            return $this->errorJson("Unhandled exception in bot helper: " . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
        }
    }

    /**
     * List all nodes with server counts.
     */
    private function handleListNodes(): int
    {
        $nodes = Node::withCount('servers')->get()->map(function (Node $node) {
            return [
                'id'            => $node->id,
                'name'          => $node->name,
                'fqdn'          => $node->fqdn,
                'ssh_host'      => $node->ssh_host,
                'ssh_port'      => $node->ssh_port ?: 22,
                'servers_count' => $node->servers_count,
                'paid_servers'  => $node->servers()->where('plan_tier', 'paid')->count(),
                'free_servers'  => $node->servers()->where(function ($q) {
                    $q->where('plan_tier', 'free')->orWhereNull('plan_tier');
                })->count(),
            ];
        });

        return $this->outputJson([
            'success' => true,
            'nodes'   => $nodes,
            'total'   => $nodes->count(),
        ]);
    }

    /**
     * Find a user by Discord ID, email, or database ID and return their VMs.
     */
    private function handleGetUserVms(): int
    {
        $userQuery = trim((string) $this->option('user'));
        if (empty($userQuery)) {
            return $this->errorJson("Missing required --user option (provide Discord ID, Email, or User ID).");
        }

        // Search by discord_id first, then id, then email
        $user = User::where('discord_id', $userQuery)
            ->orWhere('id', is_numeric($userQuery) ? (int)$userQuery : 0)
            ->orWhere('email', $userQuery)
            ->orWhere('discord_username', $userQuery)
            ->first();

        if (!$user) {
            return $this->outputJson([
                'success' => false,
                'error'   => "No registered panel user found matching: '{$userQuery}'. Ensure the user has linked their Discord account.",
                'user'    => null,
                'servers' => [],
            ]);
        }

        $servers = Server::with(['node'])->where('user_id', $user->id)->get()->map(function (Server $server) {
            $latestBackup = Backup::where('server_id', $server->id)->latest('created_at')->first();

            return [
                'id'            => $server->id,
                'vmid'          => $server->vmid,
                'name'          => $server->name,
                'hostname'      => $server->hostname,
                'node_id'       => $server->node_id,
                'node_name'     => $server->node?->name ?? "Node #{$server->node_id}",
                'plan_tier'     => $server->plan_tier ?? 'free',
                'cpu'           => $server->cpu,
                'memory_mb'     => round($server->memory / 1048576),
                'disk_gb'       => round($server->disk / 1073741824),
                'status'        => $server->status ?? 'active',
                'backup_limit'  => $server->backup_limit,
                'backups_count' => Backup::where('server_id', $server->id)->count(),
                'last_backup'   => $latestBackup ? [
                    'id'           => $latestBackup->id,
                    'created_at'   => $latestBackup->created_at?->toIso8601String(),
                    'cloud_status' => $latestBackup->cloud_status,
                ] : null,
            ];
        });

        return $this->outputJson([
            'success' => true,
            'user'    => [
                'id'               => $user->id,
                'name'             => $user->name,
                'email'            => $user->email,
                'discord_id'       => $user->discord_id,
                'discord_username' => $user->discord_username,
            ],
            'servers' => $servers,
            'total'   => $servers->count(),
        ]);
    }

    /**
     * Trigger backups for a list of server IDs and optionally stream immediately to Google Drive.
     */
    private function handleBackupVms(): int
    {
        $serverIdsRaw = (string) $this->option('servers');
        if (empty($serverIdsRaw)) {
            return $this->errorJson("Missing required --servers option (comma-separated server IDs).");
        }

        $serverIds = array_filter(array_map('intval', explode(',', $serverIdsRaw)));
        if (empty($serverIds)) {
            return $this->errorJson("Invalid server IDs provided.");
        }

        $servers = Server::with(['node', 'user'])->whereIn('id', $serverIds)->get();
        if ($servers->isEmpty()) {
            return $this->errorJson("None of the specified servers were found in the database.");
        }

        $sync       = (bool) $this->option('sync');
        $customName = $this->option('name');
        $results    = [];

        foreach ($servers as $server) {
            $backupName = $customName ?: 'Discord Bot Backup (' . now()->format('Y-m-d H:i') . ')';

            try {
                $backup = $this->backupCreationService->create(
                    server         : $server,
                    name           : $backupName,
                    mode           : BackupMode::SNAPSHOT,
                    compressionType: BackupCompressionType::ZSTD,
                    isLocked       : false,
                );

                $result = [
                    'server_id'       => $server->id,
                    'server_hostname' => $server->hostname,
                    'vmid'            => $server->vmid,
                    'node_name'       => $server->node?->name ?? "Node #{$server->node_id}",
                    'plan_tier'       => $server->plan_tier ?? 'free',
                    'success'         => true,
                    'backup_id'       => $backup?->id,
                    'backup_uuid'     => $backup?->uuid,
                    'backup_name'     => $backup?->name,
                    'status'          => 'dispatched',
                    'cloud_status'    => 'pending',
                    'error'           => null,
                ];

                // If --sync is requested, wait for Proxmox snapshot and immediately stream to Google Drive
                if ($sync && $backup) {
                    $result['cloud_sync_requested'] = true;
                    $startTime = time();
                    $completed = false;
                    $upid = $backup->upid ?? null;

                    while (time() - $startTime < 180) {
                        if ($upid) {
                            try {
                                $this->monitorService->checkCreationProgress($backup, $upid);
                            } catch (Throwable) {}
                        }
                        $freshBackup = $backup->fresh();
                        if ($freshBackup && $freshBackup->is_successful && !empty($freshBackup->file_name)) {
                            $completed = true;
                            $backup = $freshBackup;
                            break;
                        }
                        sleep(3);
                    }

                    if ($completed) {
                        try {
                            UploadBackupToCloudJob::dispatchSync($backup->id);
                            $result['cloud_status'] = 'uploaded';
                            $result['file_name']    = $backup->file_name;
                        } catch (Throwable $ue) {
                            $result['cloud_status'] = 'failed';
                            $result['cloud_error']  = $ue->getMessage();
                        }
                    } else {
                        // Let background worker upload once snapshot completes
                        $result['cloud_status'] = 'queued_in_background';
                    }
                }

                $results[] = $result;

            } catch (TooManyBackupsException $e) {
                $results[] = [
                    'server_id'       => $server->id,
                    'server_hostname' => $server->hostname,
                    'success'         => false,
                    'error'           => "Backup limit reached ({$e->getMessage()})",
                ];
            } catch (TooManyRequestsHttpException $e) {
                $results[] = [
                    'server_id'       => $server->id,
                    'server_hostname' => $server->hostname,
                    'success'         => false,
                    'error'           => "Rate limited: {$e->getMessage()}",
                ];
            } catch (Throwable $e) {
                $results[] = [
                    'server_id'       => $server->id,
                    'server_hostname' => $server->hostname,
                    'success'         => false,
                    'error'           => $e->getMessage(),
                ];
            }
        }

        return $this->outputJson([
            'success' => true,
            'results' => $results,
            'total'   => count($results),
        ]);
    }

    /**
     * Trigger bulk backups across all nodes or a specific node, filtered by tier (all, paid, free).
     */
    private function handleBackupBulk(): int
    {
        $nodeId = $this->option('node');
        $tier   = strtolower(trim((string) $this->option('tier') ?: 'all'));
        $sync   = (bool) $this->option('sync');

        $query = Server::with(['node', 'user']);

        if (!empty($nodeId) && is_numeric($nodeId)) {
            $query->where('node_id', (int) $nodeId);
        }

        if ($tier === 'paid') {
            $query->where('plan_tier', 'paid');
        } elseif ($tier === 'free') {
            $query->where(function ($q) {
                $q->where('plan_tier', 'free')->orWhereNull('plan_tier');
            });
        }

        $servers = $query->get();

        if ($servers->isEmpty()) {
            return $this->outputJson([
                'success' => true,
                'message' => "No servers matched criteria (Node: " . ($nodeId ?: 'All') . ", Tier: {$tier}).",
                'results' => [],
                'total'   => 0,
            ]);
        }

        $results = [];

        foreach ($servers as $server) {
            try {
                $backup = $this->backupCreationService->create(
                    server         : $server,
                    name           : 'Bulk ' . ucfirst($tier) . ' Backup (' . now()->format('Y-m-d H:i') . ')',
                    mode           : BackupMode::SNAPSHOT,
                    compressionType: BackupCompressionType::ZSTD,
                    isLocked       : false,
                );

                $item = [
                    'server_id'       => $server->id,
                    'server_hostname' => $server->hostname,
                    'vmid'            => $server->vmid,
                    'node_name'       => $server->node?->name ?? "Node #{$server->node_id}",
                    'plan_tier'       => $server->plan_tier ?? 'free',
                    'success'         => true,
                    'backup_id'       => $backup?->id,
                    'cloud_status'    => 'pending',
                ];

                if ($sync && $backup) {
                    $item['cloud_sync_requested'] = true;
                    $startTime = time();
                    $completed = false;
                    $upid = $backup->upid ?? null;

                    while (time() - $startTime < 180) {
                        if ($upid) {
                            try {
                                $this->monitorService->checkCreationProgress($backup, $upid);
                            } catch (Throwable) {}
                        }
                        $freshBackup = $backup->fresh();
                        if ($freshBackup && $freshBackup->is_successful && !empty($freshBackup->file_name)) {
                            $completed = true;
                            $backup = $freshBackup;
                            break;
                        }
                        sleep(3);
                    }

                    if ($completed) {
                        try {
                            UploadBackupToCloudJob::dispatchSync($backup->id);
                            $item['cloud_status'] = 'uploaded';
                            $item['file_name']    = $backup->file_name;
                        } catch (Throwable $ue) {
                            $item['cloud_status'] = 'failed';
                            $item['cloud_error']  = $ue->getMessage();
                        }
                    } else {
                        $item['cloud_status'] = 'queued_in_background';
                    }
                }

                $results[] = $item;

            } catch (Throwable $e) {
                $results[] = [
                    'server_id'       => $server->id,
                    'server_hostname' => $server->hostname,
                    'success'         => false,
                    'error'           => $e->getMessage(),
                ];
            }
        }

        return $this->outputJson([
            'success' => true,
            'node_id' => $nodeId ?: 'all',
            'tier'    => $tier,
            'results' => $results,
            'total'   => count($results),
        ]);
    }

    private function outputJson(array $data): int
    {
        $this->output->writeln(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        return self::SUCCESS;
    }

    private function errorJson(string $message, array $extra = []): int
    {
        $this->output->writeln(json_encode(array_merge([
            'success' => false,
            'error'   => $message,
        ], $extra), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        return self::FAILURE;
    }
}
