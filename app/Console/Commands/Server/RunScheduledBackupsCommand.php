<?php



namespace Convoy\Console\Commands\Server;

use Convoy\Enums\Server\BackupCompressionType;
use Convoy\Enums\Server\BackupMode;
use Convoy\Exceptions\Service\Backup\TooManyBackupsException;
use Convoy\Models\Server;
use Convoy\Services\Backups\BackupCreationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Throwable;

/**
 * Runs scheduled cloud backups for servers.
 *
 * Usage:
 *   php artisan server:run-scheduled-backups
 *       (Standard: paid-tier servers not backed up in last 24h)
 *
 *   php artisan server:run-scheduled-backups --all --force
 *       (Admin instant trigger: backup ALL servers immediately)
 *
 *   php artisan server:run-scheduled-backups --server=42 --force
 *       (Admin single test: backup server #42 immediately)
 */
class RunScheduledBackupsCommand extends Command
{
    protected $signature = 'server:run-scheduled-backups
                            {--all : Backup all servers regardless of plan tier}
                            {--tier=all : Filter by plan tier: all, paid, free}
                            {--force : Bypass the 24-hour backup window check}
                            {--sync : Wait for Proxmox snapshot and immediately stream to Google Drive}
                            {--prune-oldest : Automatically rotate/delete oldest unlocked backup if limit is reached}
                            {--server= : Backup a specific server by ID}';

    protected $aliases = ['p:server:run-scheduled-backups'];

    protected $description = 'Create automated cloud backups for servers and push to Google Drive.';

    public function __construct(
        private BackupCreationService $backupCreationService,
        private \Convoy\Services\Backups\BackupMonitorService $monitorService,
        private \Convoy\Services\Backups\BackupDeletionService $backupDeletionService
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $all      = (bool) $this->option('all');
        $force    = (bool) $this->option('force');
        $sync     = (bool) $this->option('sync');
        $prune    = (bool) $this->option('prune-oldest');
        $tier     = strtolower(trim((string) $this->option('tier') ?: 'all'));
        $serverId = $this->option('server');

        $query = Server::with(['node', 'user', 'backups']);

        if ($serverId) {
            $query->where('id', $serverId);
        } else {
            if (!$all && $tier === 'paid') {
                $query->where('plan_tier', 'paid');
            } elseif (!$all && $tier === 'free') {
                $query->where(function ($q) {
                    $q->where('plan_tier', 'free')->orWhereNull('plan_tier');
                });
            }

            // Skip servers backed up in last 24h unless force is requested
            if (!$force) {
                $query->whereDoesntHave('backups', function ($q) {
                    $q->where('created_at', '>', now()->subDay());
                });
            }
        }

        $servers = $query->get();

        $this->info("Found {$servers->count()} server(s) eligible for backup.");

        if ($servers->isEmpty()) {
            $this->warn("No matching servers found. Tip: Use '--all --force' to backup all servers right now.");
            return self::SUCCESS;
        }

        $succeeded = 0;
        $skipped   = 0;

        foreach ($servers as $server) {
            $this->line("-> Processing server #{$server->id} ({$server->hostname}, tier: {$server->plan_tier})...");

            $backup = null;
            try {
                $backup = $this->backupCreationService->create(
                    server         : $server,
                    name           : 'Automated backup (' . now()->format('Y-m-d H:i') . ')',
                    mode           : BackupMode::SNAPSHOT,
                    compressionType: BackupCompressionType::ZSTD,
                    isLocked       : false,
                );

            } catch (TooManyBackupsException $e) {
                if ($prune) {
                    $oldest = $server->backups()->where('is_locked', false)->oldest('id')->first();
                    if ($oldest) {
                        $this->line("   [PRUNE] Backup limit reached. Deleting oldest backup #{$oldest->id} ({$oldest->file_name})...");
                        try {
                            $this->backupDeletionService->handle($oldest);
                            // Retry creation after pruning
                            $backup = $this->backupCreationService->create(
                                server         : $server,
                                name           : 'Automated backup (' . now()->format('Y-m-d H:i') . ')',
                                mode           : BackupMode::SNAPSHOT,
                                compressionType: BackupCompressionType::ZSTD,
                                isLocked       : false,
                            );
                        } catch (Throwable $pe) {
                            $skipped++;
                            $this->warn("   [WARN] Pruning failed: " . $pe->getMessage());
                            continue;
                        }
                    } else {
                        $skipped++;
                        $this->warn("   [WARN] Skipped server #{$server->id}: all backups are locked.");
                        continue;
                    }
                } else {
                    $skipped++;
                    Log::warning("[RunScheduledBackups] Skipping server #{$server->id} ({$server->hostname}): backup limit reached.");
                    $this->warn("   [WARN] Skipped server #{$server->id}: backup limit reached.");
                    continue;
                }

            } catch (TooManyRequestsHttpException $e) {
                $skipped++;
                Log::warning("[RunScheduledBackups] Skipping server #{$server->id} ({$server->hostname}): rate-limited.");
                $this->warn("   [WARN] Skipped server #{$server->id}: rate limited - will retry next run.");
                continue;

            } catch (Throwable $e) {
                $skipped++;
                Log::error("[RunScheduledBackups] Unexpected error for server #{$server->id} ({$server->hostname}): " . $e->getMessage());
                $this->error("   [ERR] Error for server #{$server->id}: " . $e->getMessage());
                continue;
            }

            if ($backup) {
                $succeeded++;
                $this->line("   [OK] Dispatched snapshot for server #{$server->id} (Backup #{$backup->id})");

                if ($sync) {
                    $this->line("   ⏳ Waiting for snapshot and streaming directly to Google Drive...");
                    $startTime = time();
                    $completed = false;
                    $upid = $backup->upid ?? null;

                    while (time() - $startTime < 180) {
                        if ($upid) {
                            try {
                                $this->monitorService->checkCreationProgress($backup, $upid);
                            } catch (Throwable) {}
                        }
                        $fresh = $backup->fresh();
                        if ($fresh && $fresh->is_successful && !empty($fresh->file_name)) {
                            $completed = true;
                            $backup = $fresh;
                            break;
                        }
                        sleep(3);
                    }

                    if ($completed) {
                        try {
                            \Convoy\Jobs\Server\UploadBackupToCloudJob::dispatchSync($backup->id);
                            $this->info("   🎉 [CLOUD] Successfully uploaded Backup #{$backup->id} to Google Drive!");
                        } catch (Throwable $ue) {
                            $this->error("   ❌ [CLOUD ERROR] " . $ue->getMessage());
                        }
                    } else {
                        $this->warn("   ⚠️ Proxmox snapshot took >180s. Upload queued in background.");
                    }
                }
            }
        }

        $this->info("Backup run complete. Dispatched: {$succeeded}, Skipped: {$skipped}.");

        return self::SUCCESS;
    }
}