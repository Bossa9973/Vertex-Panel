<?php

namespace Convoy\Jobs\Server;

use Convoy\Models\Backup;
use Convoy\Services\Backups\BackupUploadDiagnosticService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use phpseclib3\Crypt\PublicKeyLoader;
use phpseclib3\Net\SFTP;
use Throwable;

/**
 * Streams a completed Proxmox backup archive from the node's local disk
 * to the admin's Google Drive via SFTP + Flysystem.
 *
 * Memory note: phpseclib3 streams chunks, but PHP still buffers each chunk.
 * This job accepts the ~2 GB practical ceiling imposed by default PHP memory limits.
 * If a backup exceeds this, it will fail and be marked cloud_status=failed.
 *
 * Queue: env(BACKUP_UPLOAD_QUEUE, 'backups') — kept separate from the default
 * queue so long-running uploads don't starve MonitorBackupJob releases.
 */
class UploadBackupToCloudJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Maximum seconds to allow the job to run. VM backups can be large.
     */
    public int $timeout = 3600;

    /**
     * Number of attempts before marking the backup as permanently failed.
     */
    public int $tries = 3;

    public function __construct(protected int $backupId)
    {
        // Default to 'default' queue so standard workers automatically process it.
        // Can be routed to a custom queue by setting BACKUP_UPLOAD_QUEUE in .env.
        $this->onQueue(env('BACKUP_UPLOAD_QUEUE', 'default'));
    }

    public function handle(): void
    {
        $backup = Backup::with('server.node')->findOrFail($this->backupId);

        // Idempotency guard: if a previous attempt already completed, skip.
        if ($backup->cloud_status === 'uploaded') {
            Log::info("[UploadBackup] Backup #{$this->backupId} already uploaded — skipping.");
            return;
        }

        // If the Proxmox backup is still running or has no file yet, release back to queue
        if (!$backup->is_successful || !$backup->file_name) {
            if ($backup->created_at && $backup->created_at->diffInMinutes(now()) < 30 && method_exists($this, 'release')) {
                Log::info("[UploadBackup] Backup #{$this->backupId} is still being created on Proxmox. Releasing back to queue for 10s...");
                $this->release(10);
                return;
            }

            Log::warning("[UploadBackup] Backup #{$this->backupId} is not successful or has no file_name — skipping upload.");
            return;
        }

        $server = $backup->server;
        $node   = $server->node;

        $sshHost     = !empty($node->ssh_host) ? trim($node->ssh_host) : trim($node->fqdn ?? '');
        $sshPort     = (int) ($node->ssh_port ?: 22);
        $sshUsername = !empty($node->ssh_username) ? trim($node->ssh_username) : 'root';

        // Validate that the node has SSH credentials configured.
        if (empty($sshHost) || empty($node->ssh_private_key)) {
            throw new \RuntimeException(
                "Node #{$node->id} ({$node->name}) is missing SSH credentials (host or private key). " .
                "Configure SSH Settings in Admin -> Nodes -> {$node->name} -> SSH Settings."
            );
        }

        // Mark as uploading so the UI reflects the current state.
        $backup->update(['cloud_status' => 'uploading']);

        $stream = null;
        try {
            // Load and normalize private key (supports raw multi-line, single-line pasted key, or server file path)
            $rawKey = trim($node->ssh_private_key ?? '');
            if (file_exists($rawKey) && is_readable($rawKey)) {
                $rawKey = file_get_contents($rawKey);
            }

            $diagnosticService = app(BackupUploadDiagnosticService::class);
            $rawKey = $diagnosticService->normalizePrivateKey($rawKey);

            try {
                $key = PublicKeyLoader::load($rawKey);
            } catch (Throwable $ke) {
                throw new \RuntimeException(
                    "Failed to parse SSH Private Key for Node #{$node->id} ({$node->name}): " . $ke->getMessage() .
                    ". Ensure the key is unencrypted (no password) and in standard PEM/OpenSSH format."
                );
            }

            // --- SFTP connection ---
            $sftp = new SFTP($sshHost, $sshPort, 30);
            $sftp->setTimeout(120);

            if (!$sftp->login($sshUsername, $key)) {
                $disconnectReason = $sftp->getDisconnectReason() ?: $sftp->getLastError();
                $extra = $disconnectReason ? " [Server reported: {$disconnectReason}]" : "";
                throw new \RuntimeException(
                    "SFTP authentication failed for user '{$sshUsername}' on node #{$node->id} ({$sshHost}:{$sshPort}){$extra}. " .
                    "Verify that the corresponding public key is saved in `/root/.ssh/authorized_keys` on the node with 600 permissions."
                );
            }

            // Build the remote path. Uses the configurable backup_path or falls
            // back to /var/lib/vz/dump (Proxmox default for dir-type storage).
            $basePath   = rtrim($node->getBackupBasePath(), '/');
            $remotePath = $basePath . '/' . $backup->file_name;

            // Auto-heal: If file does not exist or file_name was corrupt (e.g. 'size:'), scan remote dir for newest backup of this VMID
            if (!$sftp->stat($remotePath) || !str_starts_with($backup->file_name, 'vzdump-')) {
                $dirContents = $sftp->nlist($basePath);
                if (is_array($dirContents)) {
                    $matchingFiles = array_filter($dirContents, function ($f) use ($server) {
                        return str_contains($f, "{$server->vmid}") && str_starts_with($f, 'vzdump-');
                    });
                    if (!empty($matchingFiles)) {
                        rsort($matchingFiles);
                        $healedFileName = reset($matchingFiles);
                        $healedPath     = $basePath . '/' . $healedFileName;
                        if ($sftp->stat($healedPath)) {
                            Log::info("[UploadBackup] Auto-healed backup #{$backup->id} file_name from '{$backup->file_name}' to '{$healedFileName}'.");
                            $backup->update(['file_name' => $healedFileName]);
                            $remotePath = $healedPath;
                        }
                    }
                }
            }

            // Verify the file exists before streaming.
            if (!$sftp->stat($remotePath)) {
                throw new \RuntimeException(
                    "Backup file not found on node #{$node->id}: '{$remotePath}'. " .
                    "Verify the file exists on the node or check 'Backup Path' in Node SSH Settings."
                );
            // Stat the remote file to get exact size
            $stat = $sftp->stat($remotePath);
            $fileSizeBytes = $stat['size'] ?? 0;
            $fileSizeFormatted = $this->formatBytes($fileSizeBytes);

            if (app()->runningInConsole()) {
                echo "\n   📦 Archive Size: {$fileSizeFormatted} ({$fileSizeBytes} bytes)\n";
                echo "   ⏳ [Phase 1/2] Downloading from Proxmox node via SFTP...\n";
            }

            // Use a local temp file on disk instead of in-memory php://temp to handle 10GB+ files with zero RAM overhead
            $tempFile = tempnam(sys_get_temp_dir(), 'vtx_backup_');
            $startTime = microtime(true);
            $lastPercent = -1;

            $sftp->get($remotePath, $tempFile, 0, -1, function ($transferred) use ($fileSizeBytes, &$lastPercent, $startTime) {
                if ($fileSizeBytes > 0) {
                    $percent = (int) round(($transferred / $fileSizeBytes) * 100);
                    if ($percent !== $lastPercent && ($percent % 5 === 0 || $percent === 100)) {
                        $lastPercent = $percent;
                        $elapsed = max(0.1, microtime(true) - $startTime);
                        $speedMBs = round(($transferred / 1048576) / $elapsed, 1);
                        $mbTransferred = round($transferred / 1048576, 1);
                        $mbTotal = round($fileSizeBytes / 1048576, 1);
                        if (app()->runningInConsole()) {
                            echo "      SFTP Stream: [{$percent}%] {$mbTransferred}MB / {$mbTotal}MB ({$speedMBs} MB/s)\r";
                        }
                    }
                }
            });

            if (app()->runningInConsole()) {
                echo "\n   ✅ SFTP download complete! Archive buffered successfully.\n";
                echo "   ☁️  [Phase 2/2] Streaming to Google Drive folder 'convoy-backups'...\n";
            }

            // --- Google Drive path ---
            // Format: node-{id} ({name})/server-{id} ({hostname})/{file_name}
            $drivePath = sprintf(
                'node-%d (%s)/server-%d (%s)/%s',
                $node->id,
                $this->sanitizeName($node->name),
                $server->id,
                $this->sanitizeName($server->hostname),
                $backup->file_name
            );

            // Stream to Google Drive. Flysystem handles resumable chunked upload.
            $stream = fopen($tempFile, 'rb');
            Storage::disk('gdrive')->put($drivePath, $stream);
            fclose($stream);
            $stream = null;
            @unlink($tempFile);

            if (app()->runningInConsole()) {
                echo "   🎉 Google Drive stream complete!\n";
            }

            // --- Mark as uploaded ---
            $backup->update([
                'cloud_status'      => 'uploaded',
                'cloud_path'        => $drivePath,
                'cloud_uploaded_at' => now(),
            ]);

            Log::info("[UploadBackup] Backup #{$this->backupId} ({$backup->file_name}) successfully uploaded to Drive at: {$drivePath}");

        } catch (Throwable $e) {
            // Reset to pending so the next retry attempt can try again.
            // If all retries are exhausted, failed() will set cloud_status=failed.
            $backup->update(['cloud_status' => 'pending']);
            throw $e;
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
            if (isset($tempFile) && file_exists($tempFile)) {
                @unlink($tempFile);
            }
        }
    }

    /**
     * Called by Laravel after all retry attempts are exhausted.
     * Permanently marks the backup as failed so the UI can surface the error.
     */
    public function failed(Throwable $exception): void
    {
        Log::error("[UploadBackup] Backup #{$this->backupId} permanently failed after {$this->tries} attempts: " . $exception->getMessage());

        Backup::where('id', $this->backupId)->update(['cloud_status' => 'failed']);
    }

    /**
     * Sanitizes a name for use in a Drive folder path by removing characters
     * that Google Drive does not accept in folder/file names.
     */
    private function sanitizeName(string $name): string
    {
        return preg_replace('/[\/\\\\:*?"<>|]/', '-', $name);
    }

    /**
     * Human-readable byte formatting.
     */
    private function formatBytes(int $bytes, int $precision = 2): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= pow(1024, $pow);
        return round($bytes, $precision) . ' ' . $units[$pow];
    }
}
