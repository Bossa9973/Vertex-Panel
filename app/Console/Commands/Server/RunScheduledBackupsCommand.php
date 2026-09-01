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
                            {--force : Bypass the 24-hour backup window check}
                            {--server= : Backup a specific server by ID}';

    protected $description = 'Create automated cloud backups for servers and push to Google Drive.';

    public function __construct(private BackupCreationService $backupCreationService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $all = $this->option('all');
        $force = $this->option('force');
        $serverId = $this->option('server');

        $query = Server::query();

        if ($serverId) {
            $query->where('id', $serverId);
        } else {
            // If --all is not supplied, only backup paid-tier servers
            if (!$all) {
                $query->where('plan_tier', 'paid');
            }

            // If --force is not supplied, skip servers backed up within the last 24 hours
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

            try {
                $this->backupCreationService->create(
                    server         : $server,
                    name           : 'Automated backup (' . now()->format('Y-m-d H:i') . ')',
                    mode           : BackupMode::SNAPSHOT,
                    compressionType: BackupCompressionType::ZSTD,
                    isLocked       : false,
                );

                $succeeded++;
                $this->line("   [OK] Dispatched backup for server #{$server->id}");

            } catch (TooManyBackupsException $e) {
                $skipped++;
                Log::warning("[RunScheduledBackups] Skipping server #{$server->id} ({$server->hostname}): backup limit reached.", [
                    'exception' => $e->getMessage(),
                ]);
                $this->warn("   [WARN] Skipped server #{$server->id}: backup limit reached.");

            } catch (TooManyRequestsHttpException $e) {
                $skipped++;
                Log::warning("[RunScheduledBackups] Skipping server #{$server->id} ({$server->hostname}): rate-limited.", [
                    'exception' => $e->getMessage(),
                ]);
                $this->warn("   [WARN] Skipped server #{$server->id}: rate limited - will retry next run.");

            } catch (Throwable $e) {
                $skipped++;
                Log::error("[RunScheduledBackups] Unexpected error for server #{$server->id} ({$server->hostname}).", [
                    'exception' => $e->getMessage(),
                    'trace'     => $e->getTraceAsString(),
                ]);
                $this->error("   [ERR] Error for server #{$server->id}: " . $e->getMessage());
            }
        }

        $this->info("Backup run complete. Dispatched: {$succeeded}, Skipped: {$skipped}.");

        return self::SUCCESS;
    }
}