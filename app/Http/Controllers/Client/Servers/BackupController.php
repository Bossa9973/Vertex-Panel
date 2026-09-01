<?php



namespace Convoy\Http\Controllers\Client\Servers;

use Convoy\Enums\Server\BackupCompressionType;
use Convoy\Enums\Server\BackupMode;
use Convoy\Http\Controllers\ApiController;
use Convoy\Http\Requests\Client\Servers\Backups\DeleteBackupRequest;
use Convoy\Http\Requests\Client\Servers\Backups\RestoreBackupRequest;
use Convoy\Http\Requests\Client\Servers\Backups\StoreBackupRequest;
use Convoy\Models\Backup;
use Convoy\Models\Server;
use Convoy\Repositories\Eloquent\BackupRepository;
use Convoy\Services\Backups\BackupCreationService;
use Convoy\Services\Backups\BackupDeletionService;
use Convoy\Services\Backups\RestoreFromBackupService;
use Convoy\Transformers\Client\BackupTransformer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Spatie\QueryBuilder\QueryBuilder;

class BackupController extends ApiController
{
    public function __construct(
        private BackupCreationService    $backupCreationService,
        private BackupDeletionService    $backupDeletionService,
        private RestoreFromBackupService $restoreFromBackupService,
        private BackupRepository         $backupRepository,
    )
    {
    }

    public function index(Request $request, Server $server)
    {
        $backups = QueryBuilder::for(Backup::query())
                               ->where('backups.server_id', $server->id)
                               ->allowedFilters(['name'])
                               ->defaultSort('-created_at')
                               ->allowedSorts('created_at', 'completed_at')
                               ->paginate(min($request->query('per_page') ?? 20, 50));

        return fractal($backups, new BackupTransformer())->addMeta([
            'backup_count' => $this->backupRepository->getNonFailedBackups($server)->count(),
        ])->respond();
    }

    public function store(StoreBackupRequest $request, Server $server)
    {
        $backup = $this->backupCreationService
            ->create(
                server         : $server,
                name           : $request->name,
                mode           : $request->enum('mode', BackupMode::class),
                compressionType: $request->enum('compression_type', BackupCompressionType::class),
                isLocked       : $request->input('locked', false),
            );

        \Convoy\Facades\Activity::event('server:backup-create')
            ->subject($server)
            ->property(['name' => $backup->name, 'backup_id' => $backup->id])
            ->log("Created backup '{$backup->name}' for server {$server->name}");

        return fractal($backup, new BackupTransformer())->respond();
    }

    public function restore(RestoreBackupRequest $request, Server $server, Backup $backup)
    {
        $this->restoreFromBackupService->handle($server, $backup);

        \Convoy\Facades\Activity::event('server:backup-restore')
            ->subject($server)
            ->property(['name' => $backup->name, 'backup_id' => $backup->id])
            ->log("Restored server {$server->name} from backup '{$backup->name}'");

        return $this->returnNoContent();
    }

    /**
     * Generate a short-lived Google Drive download URL for a backup that has
     * been successfully uploaded to the cloud.
     *
     * The cloud_path is never returned to the client — only the signed URL.
     * Access is already gated by BackupPolicy::before() (owner or root_admin).
     */
    public function download(Request $request, Server $server, Backup $backup): JsonResponse
    {
        if ($backup->cloud_status !== 'uploaded') {
            abort(409, 'This backup is not yet available for download. Current status: ' . $backup->cloud_status);
        }

        // Generate a 5-minute signed download URL via the Drive API.
        // The underlying masbug adapter uses the Drive webContentLink with
        // short-lived auth so the URL is not publicly guessable.
        $url = Storage::disk('gdrive')->temporaryUrl(
            $backup->cloud_path,
            now()->addMinutes(5),
        );

        \Convoy\Facades\Activity::event('server:backup-download')
            ->subject($server)
            ->property(['name' => $backup->name, 'backup_id' => $backup->id])
            ->log("Downloaded backup '{$backup->name}' for server {$server->name}");

        return response()->json(['url' => $url]);
    }

    public function destroy(DeleteBackupRequest $request, Server $server, Backup $backup)
    {
        $backupName = $backup->name;
        $this->backupDeletionService->handle($backup);

        \Convoy\Facades\Activity::event('server:backup-delete')
            ->subject($server)
            ->property(['name' => $backupName])
            ->log("Deleted backup '{$backupName}' for server {$server->name}");

        return $this->returnNoContent();
    }
}

