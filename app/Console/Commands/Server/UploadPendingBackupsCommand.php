<?php

namespace Convoy\Console\Commands\Server;

use Convoy\Jobs\Server\UploadBackupToCloudJob;
use Convoy\Models\Backup;
use Illuminate\Console\Command;
use Throwable;

/**
 * Upload pending or un-uploaded backups directly to Google Drive.
 *
 * Usage:
 *   php artisan server:upload-pending-backups
 *   php artisan server:upload-pending-backups --sync
 *   php artisan server:upload-pending-backups --server=42 --sync
 */
class UploadPendingBackupsCommand extends Command
{
    protected $signature = 'server:upload-pending-backups
                            {--server= : Only process backups for a specific server ID}
                            {--sync : Execute upload synchronously in this terminal with live output}
                            {--force : Retry backups even if previously marked failed}';

    protected $description = 'Dispatch or immediately stream un-uploaded VM backups to Google Drive.';

    public function handle(): int
    {
        $serverId = $this->option('server');
        $sync     = $this->option('sync');
        $force    = $this->option('force');

        $query = Backup::with('server.node')
            ->where('is_successful', true)
            ->whereNotNull('file_name');

        if ($serverId) {
            $query->where('server_id', (int) $serverId);
        }

        if (!$force) {
            $query->where(function ($q) {
                $q->whereNull('cloud_status')
                  ->orWhereIn('cloud_status', ['pending', 'uploading']);
            });
        } else {
            $query->where(function ($q) {
                $q->whereNull('cloud_status')
                  ->orWhere('cloud_status', '!=', 'uploaded');
            });
        }

        $backups = $query->orderBy('id', 'desc')->get();

        $this->info("Found {$backups->count()} backup(s) eligible for cloud upload.");

        if ($backups->isEmpty()) {
            $this->line("No pending backups found to upload.");
            return self::SUCCESS;
        }

        $succeeded = 0;
        $failed    = 0;

        foreach ($backups as $backup) {
            $server = $backup->server;
            $node   = $server?->node;

            $this->line("-> Processing Backup #{$backup->id} for Server #{$backup->server_id} ({$backup->file_name})...");

            if (!$node) {
                $this->error("   [ERROR] Server #{$backup->server_id} has no assigned node.");
                $failed++;
                continue;
            }

            if ($sync) {
                try {
                    $this->line("   [STREAMING] Uploading via SFTP to Google Drive synchronously...");
                    UploadBackupToCloudJob::dispatchSync($backup->id);
                    $this->info("   ✅ [OK] Successfully uploaded Backup #{$backup->id} to Google Drive!");
                    $succeeded++;
                } catch (Throwable $e) {
                    $this->error("   ❌ [FAILED] Upload failed: " . $e->getMessage());
                    $failed++;
                }
            } else {
                UploadBackupToCloudJob::dispatch($backup->id);
                $this->info("   [DISPATCHED] Dispatched to background queue for Backup #{$backup->id}.");
                $succeeded++;
            }
        }

        $this->info("Complete. Processed: {$succeeded}, Failed: {$failed}.");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
