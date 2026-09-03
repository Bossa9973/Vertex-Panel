<?php

namespace Convoy\Services\Backups;

use Convoy\Enums\Server\State;
use Convoy\Enums\Server\Status;
use Convoy\Jobs\Server\MonitorBackupRestorationJob;
use Convoy\Models\Backup;
use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\Server\ProxmoxBackupRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxServerRepository;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use phpseclib3\Crypt\PublicKeyLoader;
use phpseclib3\Net\SFTP;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Throwable;

class RestoreFromBackupService
{
    public function __construct(
        private ConnectionInterface     $connection,
        private ProxmoxServerRepository $serverRepository,
        private ProxmoxBackupRepository $proxmoxRepository,
    )
    {
    }

    public function handle(Server $server, Backup $backup)
    {
        if (!is_null($server->status)) {
            throw new BadRequestHttpException(
                'This server is not currently in a state that allows for a backup to be restored.',
            );
        }

        $stateData = $this->serverRepository->setServer($server)->getState();
        if ($stateData->state !== State::STOPPED) {
            throw new BadRequestHttpException(
                'The server needs to be stopped before a backup can be restored.',
            );
        }

        if (!$backup->successful && is_null($backup->completed_at)) {
            throw new BadRequestHttpException(
                'This backup cannot be restored at this time: not completed or failed.',
            );
        }

        // On-Demand Cloud Restoration: If archive was purged from node storage after upload,
        // stream it from Google Drive back to the node before initiating Proxmox restore.
        $this->ensureArchiveOnNode($server, $backup);

        $this->connection->transaction(function () use ($server, $backup) {
            $server->update([
                'status' => Status::RESTORING_BACKUP->value,
            ]);

            $upid = $this->proxmoxRepository->setServer($server)->restore($backup);

            MonitorBackupRestorationJob::dispatch($server->id, $upid);
        });
    }

    /**
     * Checks if the backup archive file exists on the Proxmox node.
     * If missing locally but exists in Google Drive, streams it to the node via SFTP.
     */
    protected function ensureArchiveOnNode(Server $server, Backup $backup): void
    {
        $node = $server->node;
        if (!$node || empty($backup->file_name)) {
            return;
        }

        $basePath   = rtrim($node->getBackupBasePath(), '/');
        $remotePath = $basePath . '/' . $backup->file_name;

        $sshHost     = !empty($node->ssh_host) ? trim($node->ssh_host) : trim($node->fqdn ?? '');
        $sshPort     = (int) ($node->ssh_port ?: 22);
        $sshUsername = !empty($node->ssh_username) ? trim($node->ssh_username) : 'root';

        if (empty($sshHost) || empty($node->ssh_private_key)) {
            return;
        }

        try {
            $rawKey = trim($node->ssh_private_key ?? '');
            if (file_exists($rawKey) && is_readable($rawKey)) {
                $rawKey = file_get_contents($rawKey);
            }
            $rawKey = app(BackupUploadDiagnosticService::class)->normalizePrivateKey($rawKey);
            $key    = PublicKeyLoader::load($rawKey);

            $sftp = new SFTP($sshHost, $sshPort, 20);
            if (!$sftp->login($sshUsername, $key)) {
                return;
            }

            // If file already exists on node storage, we are good to go
            if ($sftp->stat($remotePath)) {
                return;
            }

            // File missing locally: check Google Drive
            if (!empty($backup->cloud_path) && Storage::disk('gdrive')->exists($backup->cloud_path)) {
                Log::info("[CloudRestore] Pre-fetching backup #{$backup->id} from Google Drive to node #{$node->id}: '{$remotePath}'...");
                $stream = Storage::disk('gdrive')->readStream($backup->cloud_path);
                if ($stream) {
                    $temp = tempnam(sys_get_temp_dir(), 'vtx_restore_');
                    file_put_contents($temp, stream_get_contents($stream));
                    fclose($stream);

                    $sftp->put($remotePath, $temp, SFTP::SOURCE_LOCAL_FILE);
                    @unlink($temp);
                    Log::info("[CloudRestore] Successfully pre-fetched backup #{$backup->id} to '{$remotePath}' for restoration.");
                }
            }
        } catch (Throwable $e) {
            Log::warning("[CloudRestore] Error verifying/streaming backup from cloud: " . $e->getMessage());
        }
    }
}
