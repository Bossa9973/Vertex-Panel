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
            if (preg_match("/(vzdump-[a-zA-Z0-9_\-]+\.(?:vma|tar)(?:\.[a-z0-9]+)?)/i", $log['t'], $matches)) {
                $fileName = trim($matches[1]);
                break;
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

        // Clean up temporary restored archive from node storage to reclaim space
        if (config('backups.delete_local_after_upload', true)) {
            $node = $server->node;
            $cloudBackups = $server->backups()->where('cloud_status', 'uploaded')->whereNotNull('file_name')->get();
            if ($node && $cloudBackups->isNotEmpty() && !empty($node->ssh_private_key)) {
                try {
                    $rawKey = trim($node->ssh_private_key ?? '');
                    if (file_exists($rawKey) && is_readable($rawKey)) {
                        $rawKey = file_get_contents($rawKey);
                    }
                    if (!empty($rawKey)) {
                        $key = \phpseclib3\Crypt\PublicKeyLoader::load(app(BackupUploadDiagnosticService::class)->normalizePrivateKey($rawKey));
                        $sshHost = !empty($node->ssh_host) ? trim($node->ssh_host) : trim($node->fqdn ?? '');
                        $sftp = new \phpseclib3\Net\SFTP($sshHost, (int)($node->ssh_port ?: 22), 10);
                        if ($sftp->login(!empty($node->ssh_username) ? trim($node->ssh_username) : 'root', $key)) {
                            $basePath = rtrim($node->getBackupBasePath(), '/');
                            foreach ($cloudBackups as $cb) {
                                $rem = $basePath . '/' . $cb->file_name;
                                if ($sftp->stat($rem)) {
                                    $sftp->delete($rem);
                                    \Illuminate\Support\Facades\Log::info("[CloudRestore] Cleaned up temporary archive '{$rem}' from node after restoration.");
                                }
                            }
                        }
                    }
                } catch (\Throwable) {}
            }
        }
    }
}

