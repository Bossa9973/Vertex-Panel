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
 * Backup a single VM instance immediately from CLI.
 *
 * Usage:
 *   php artisan server:backup 42
 *   php artisan server:backup 42 --name="Pre-upgrade snapshot"
 *   php artisan server:backup 42 --force
 */
class BackupSingleServerCommand extends Command
{
    protected $signature = 'server:backup
                            {server : The ID of the server to back up}
                            {--name= : Custom name for the backup snapshot}
                            {--force : Force backup bypassing constraints}
                            {--sync : Wait for Proxmox snapshot to finish and stream immediately to Google Drive}';

    protected $aliases = ['p:server:backup'];

    protected $description = 'Trigger an immediate cloud backup for a single VM and upload to Google Drive.';

    public function __construct(
        private BackupCreationService $backupCreationService,
        private \Convoy\Services\Backups\BackupMonitorService $monitorService
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $serverId = (int) $this->argument('server');
        $customName = $this->option('name');
        $sync = (bool) $this->option('sync');

        $server = Server::find($serverId);
        if (!$server) {
            $this->error("Server #{$serverId} not found in database.");
            return self::FAILURE;
        }

        $this->info("Found Server #{$server->id} ({$server->name} / {$server->hostname}, VMID: {$server->vmid}, Node: {$server->node_id}).");
        $this->line("-> Initiating backup snapshot on Proxmox...");

        $backupName = $customName ?: 'Manual CLI backup (' . now()->format('Y-m-d H:i') . ')';

        try {
            $backup = $this->backupCreationService->create(
                server         : $server,
                name           : $backupName,
                mode           : BackupMode::SNAPSHOT,
                compressionType: BackupCompressionType::ZSTD,
                isLocked       : false,
            );

            $this->info("✅ [DISPATCHED] Backup snapshot dispatched to Proxmox for Server #{$server->id}!");
            if ($backup) {
                $this->line("   Backup UUID: {$backup->uuid}");
                $this->line("   Name:        {$backup->name}");
            }

            if ($sync && $backup) {
                $this->line("⏳ [--sync] Waiting for Proxmox snapshot creation to complete...");
                $startTime = time();
                $completed = false;
                $upid = $backup->upid ?? null;

                while (time() - $startTime < 180) {
                    if ($upid) {
                        try {
                            $this->monitorService->checkCreationProgress($backup, $upid);
                        } catch (\Throwable) {}
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
                    $this->info("📦 Proxmox archive ready: {$backup->file_name}");
                    $this->line("☁️  Streaming archive directly to Google Drive...");
                    \Convoy\Jobs\Server\UploadBackupToCloudJob::dispatchSync($backup->id);
                    $this->info("🎉 [SUCCESS] Backup #{$backup->id} successfully uploaded to Google Drive!");
                } else {
                    $this->warn("⚠️  Proxmox snapshot is still writing on node storage. Upload will proceed in background via queue.");
                }
            } else {
                $this->line("   Google Drive sync will start automatically upon snapshot completion.");
            }

            return self::SUCCESS;
        } catch (TooManyBackupsException $e) {
            $this->error("❌ [LIMIT REACHED] Server #{$server->id} has reached its backup limit ({$e->getMessage()}).");
            return self::FAILURE;
        } catch (TooManyRequestsHttpException $e) {
            $this->error("❌ [RATE LIMITED] Rate limit active: {$e->getMessage()}");
            return self::FAILURE;
        } catch (Throwable $e) {
            $this->error("❌ [ERROR] Backup failed for Server #{$server->id}: {$e->getMessage()}");
            Log::error("[BackupSingleServer] Error: " . $e->getMessage(), ['exception' => $e]);
            return self::FAILURE;
        }
    }
}
