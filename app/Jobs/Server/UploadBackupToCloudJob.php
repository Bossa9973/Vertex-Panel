<?php



namespace Convoy\Jobs\Server;

use Convoy\Models\Backup;
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
        // Route to the dedicated backups queue to prevent starvation of monitor jobs.
        $this->onQueue(env('BACKUP_UPLOAD_QUEUE', 'backups'));
    }

    public function handle(): void
    {
        $backup = Backup::with('server.node')->findOrFail($this->backupId);

        // Idempotency guard: if a previous attempt already completed, skip.
        if ($backup->cloud_status === 'uploaded') {
            Log::info("[UploadBackup] Backup #{$this->backupId} already uploaded — skipping.");
            return;
        }

        // Bail if the Proxmox backup itself never succeeded or has no file yet.
        if (!$backup->is_successful || !$backup->file_name) {
            Log::warning("[UploadBackup] Backup #{$this->backupId} is not successful or has no file_name — skipping upload.");
            return;
        }

        $server = $backup->server;
        $node   = $server->node;

        $sshHost     = !empty($node->ssh_host) ? $node->ssh_host : $node->fqdn;
        $sshPort     = $node->ssh_port ?: 22;
        $sshUsername = !empty($node->ssh_username) ? $node->ssh_username : 'root';

        // Validate that the node has SSH credentials configured.
        if (empty($sshHost) || empty($node->ssh_private_key)) {
            throw new \RuntimeException(
                "Node #{$node->id} ({$node->name}) is missing SSH credentials (host or private key). " .
                "Configure SSH Settings in the admin Node Settings."
            );
        }

        // Mark as uploading so the UI reflects the current state.
        $backup->update(['cloud_status' => 'uploading']);

        try {
            // Load and normalize private key (supports raw multi-line, single-line pasted key, or server file path)
            $rawKey = trim($node->ssh_private_key ?? '');
            if (file_exists($rawKey) && is_readable($rawKey)) {
                $rawKey = file_get_contents($rawKey);
            }

            $rawKey = trim($rawKey);
            if (!str_contains($rawKey, "\n")) {
                if (preg_match('/^(-----BEGIN [A-Z0-9 ]+-----)\s+(.+)\s+(-----END [A-Z0-9 ]+-----)$/', $rawKey, $m)) {
                    $header = $m[1];
                    $body   = str_replace(' ', '', $m[2]);
                    $footer = $m[3];
                    $rawKey = $header . "\n" . trim(chunk_split($body, 64, "\n")) . "\n" . $footer;
                }
            }

            // --- SFTP connection ---
            $sftp = new SFTP($sshHost, $sshPort);
            $key  = PublicKeyLoader::load($rawKey);

            if (!$sftp->login($sshUsername, $key)) {
                throw new \RuntimeException(
                    "SFTP authentication failed for node #{$node->id} ({$sshHost}:{$sshPort}, user: {$sshUsername}). " .
                    "Verify the SSH key is installed in the node's authorized_keys."
                );
            }

            // Build the remote path. Uses the configurable backup_path or falls
            // back to /var/lib/vz/dump (Proxmox default for dir-type storage).
            $remotePath = rtrim($node->getBackupBasePath(), '/') . '/' . $backup->file_name;

            // Verify the file exists before streaming.
            if (!$sftp->stat($remotePath)) {
                throw new \RuntimeException(
                    "Backup file not found on node #{$node->id}: {$remotePath}"
                );
            }

            // Open a stream — phpseclib returns a stream resource when the
            // third argument to get() is false (stream mode).
            // We use a temp PHP stream as the sink; Flysystem will drain it.
            $stream = fopen('php://temp', 'r+');
            $sftp->get($remotePath, $stream);
            rewind($stream);

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

            // Stream to Drive. Flysystem handles chunked upload internally.
            Storage::disk('gdrive')->put($drivePath, $stream);

            fclose($stream);

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
}

