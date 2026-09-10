<?php

namespace Convoy\Services\Servers;

use Convoy\Models\Server;
use Convoy\Enums\Server\Status;
use Illuminate\Support\Facades\Bus;
use Convoy\Jobs\Server\PurgeBackupsJob;
use Convoy\Exceptions\Http\Server\ServerStatusConflictException;

class ServerDeletionService
{
    public function __construct(private ServerBuildDispatchService $buildDispatchService)
    {
    }

    public function handle(Server $server, bool $noPurge = false)
    {
        $this->validateStatus($server);

        $server->update(['status' => Status::DELETING->value]);

        if (! $noPurge) {
            Bus::chain([
                new PurgeBackupsJob($server->id),
                ...$this->buildDispatchService->getChainedDeleteJobs($server),
                function () use ($server) {
                    $s = Server::find($server->id);
                    if ($s) {
                        $s->addresses()->update(['server_id' => null]);
                        $s->backups()->forceDelete();
                        $s->delete();
                    }
                },
            ])
                ->catch(function (\Throwable $e) use ($server) {
                    \Illuminate\Support\Facades\Log::error("DeleteServerJob chain failed for Server ID {$server->id} (VMID: {$server->vmid}): " . $e->getMessage(), [
                        'exception' => get_class($e),
                        'line' => $e->getLine(),
                        'file' => $e->getFile(),
                    ]);
                    Server::where('id', $server->id)->update(['status' => Status::DELETION_FAILED->value]);
                })
                ->dispatch();

            return;
        }

        $server->addresses()->update(['server_id' => null]);
        $server->backups()->forceDelete();
        $server->delete();
    }

    public function validateStatus(Server $server, bool $verifyStatusOnly = false)
    {
        if (
            ! is_null($server->status) &&
            ! in_array($server->status, [Status::DELETING->value, Status::DELETION_FAILED->value, Status::INSTALL_FAILED->value])
        ) {
            throw new ServerStatusConflictException($server);
        }

        if (! $verifyStatusOnly) {
            if ($server->backups()->whereNull('completed_at')->exists()) {
                throw new ServerStatusConflictException($server);
            }
        }
    }
}
