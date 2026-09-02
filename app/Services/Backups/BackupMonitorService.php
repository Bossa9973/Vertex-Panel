<?php



namespace Convoy\Services\Backups;

use Carbon\Carbon;
use Closure;
use Convoy\Jobs\Server\UploadBackupToCloudJob;
use Convoy\Models\Backup;
use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\Server\ProxmoxActivityRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxBackupRepository;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class BackupMonitorService
{
    public function __construct(
        private ProxmoxActivityRepository $repository,
        private ProxmoxBackupRepository   $backupRepository,
    )
    {
    }

    public function checkCreationProgress(Backup $backup, string $upid, ?Closure $callback = null)
    {
        $status = $this->repository->setServer($backup->server)->getStatus($upid);
        $logs   = $this->repository->setServer($backup->server)->getLog($upid);

        // get the filename of the backup (e.g. vzdump-qemu-101-2021_01_01-00_00_00.vma.zstd)
        $fileName = null;
        foreach ($logs as $log) {
            if (preg_match("/INFO: creating (?:vzdump|VZDump) archive '(.+)'/si", $log['t'], $matches)
                || preg_match("/(?:creating vzdump archive|archive file:?)\s*['\"]?([^'\"\s]+)/i", $log['t'], $matches)
            ) {
                $fileName = Arr::last(explode('/', trim($matches[1])));
            }
        }

        // if it's running we won't do anything to the eloquent backup record for now
        if (Arr::get($status, 'status') === 'running') {
            if ($callback) {
                $callback();
            }

            return;
        }

        if (Str::lower(Arr::get($status, 'exitstatus')) === 'ok') {
            $archives = $this->backupRepository->setServer($backup->server)->getBackups();

            // If log regex missed the filename, find the newest backup archive on storage for this VM
            if (!$fileName && !empty($archives)) {
                $newest = collect($archives)->sortByDesc('ctime')->first();
                if ($newest && !empty($newest['volid'])) {
                    $fileName = Arr::last(explode('/', $newest['volid']));
                }
            }

            $archive  = collect($archives)->where(
                'volid', "{$backup->server->node->backup_storage}:backup/{$fileName}",
            )->first() ?? (!empty($archives) ? collect($archives)->sortByDesc('ctime')->first() : null);

            $backup->update([
                'is_successful' => true,
                'file_name'     => $fileName,
                'size'          => Arr::get($archive, 'size', 0),
                'completed_at'  => Carbon::now(),
            ]);

            // Dispatch the cloud upload job now that the Proxmox backup is confirmed complete.
            // The job streams the archive from the node via SFTP and writes it to Google Drive.
            UploadBackupToCloudJob::dispatch($backup->id);

        } else {
            $backup->update([
                'is_successful' => false,
                'completed_at'  => Carbon::now(),
            ]);
        }
    }

    public function checkRestorationProgress(Server $server, string $upid, ?Closure $callback = null)
    {
        $status = $this->repository->setServer($server)->getStatus($upid);

        if (Arr::get($status, 'status') === 'running') {
            if ($callback) {
                $callback();
            }

            return;
        }

        $server->update([
            'status' => null,
        ]);
    }
}

