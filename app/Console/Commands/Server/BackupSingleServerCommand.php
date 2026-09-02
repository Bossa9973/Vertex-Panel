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
                            {--force : Force backup bypassing constraints}';

    protected $description = 'Trigger an immediate cloud backup for a single VM and upload to Google Drive.';

    public function __construct(private BackupCreationService $backupCreationService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $serverId = (int) $this->argument('server');
        $customName = $this->option('name');

        $server = Server::find($serverId);
        if (!$server) {
            $this->error("Server #{$serverId} not found in database.");
            return self::FAILURE;
        }

        $this->info("Found Server #{$server->id} ({$server->name} / {$server->hostname}, VMID: {$server->vmid}, Node: {$server->node_id}).");
        $this->line("-> Initiating backup snapshot...");

        $backupName = $customName ?: 'Manual CLI backup (' . now()->format('Y-m-d H:i') . ')';

        try {
            $backup = $this->backupCreationService->create(
                server         : $server,
                name           : $backupName,
                mode           : BackupMode::SNAPSHOT,
                compressionType: BackupCompressionType::ZSTD,
                isLocked       : false,
            );

            $this->info("✅ [SUCCESS] Backup successfully dispatched for Server #{$server->id}!");
            if ($backup) {
                $this->line("   Backup UUID: {$backup->uuid}");
                $this->line("   Name:        {$backup->name}");
            }
            $this->line("   Google Drive sync will start automatically upon snapshot completion.");

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
