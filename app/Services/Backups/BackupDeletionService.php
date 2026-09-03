<?php

namespace Convoy\Services\Backups;

use Convoy\Exceptions\Service\Backup\BackupLockedException;
use Convoy\Models\Backup;
use Convoy\Repositories\Proxmox\Server\ProxmoxBackupRepository;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

class BackupDeletionService
{
    public function __construct(private ConnectionInterface     $connection,
                                private ProxmoxBackupRepository $proxmoxRepository,
    )
    {
    }

    public function handle(Backup $backup)
    {
        if ($backup->is_locked && ($backup->is_successful && !is_null($backup->completed_at))) {
            throw new BackupLockedException();
        }

        $this->connection->transaction(function () use ($backup) {
            // Delete from Proxmox hypervisor storage if still present locally
            try {
                if ($backup->server) {
                    $this->proxmoxRepository->setServer($backup->server)->delete($backup);
                }
            } catch (Throwable $e) {
                // Local volume may already have been purged after cloud upload
                Log::debug("[BackupDeletion] Proxmox storage volume delete notice: " . $e->getMessage());
            }

            // Delete from Google Drive if uploaded
            if (!empty($backup->cloud_path)) {
                try {
                    if (Storage::disk('gdrive')->exists($backup->cloud_path)) {
                        Storage::disk('gdrive')->delete($backup->cloud_path);
                        Log::info("[BackupDeletion] Deleted cloud archive from Google Drive: {$backup->cloud_path}");
                    }
                } catch (Throwable $ge) {
                    Log::warning("[BackupDeletion] Could not delete cloud archive from Google Drive: " . $ge->getMessage());
                }
            }

            $backup->delete();
        });
    }
}
