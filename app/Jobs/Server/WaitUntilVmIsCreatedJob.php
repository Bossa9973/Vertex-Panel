<?php

namespace Convoy\Jobs\Server;

use Convoy\Exceptions\Repository\Proxmox\ProxmoxConnectionException;
use Convoy\Models\Server;
use Convoy\Services\Servers\ServerBuildService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\SkipIfBatchCancelled;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

class WaitUntilVmIsCreatedJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function retryUntil(): Carbon
    {
        // Proxmox VM cloning can take a long time under heavy node load (high CPU/disk IO).
        // 30 minutes was too short — clones were timing out even though Proxmox finished
        // the operation eventually. 2 hours gives enough headroom for busy nodes.
        return now()->addHours(2);
    }

    public function middleware(): array
    {
        return [new SkipIfBatchCancelled()];
    }

    public function __construct(protected int $serverId)
    {
        //
    }

    public function handle(ServerBuildService $service): void
    {
        $server = Server::findOrFail($this->serverId);

        try {
            $isCreated = $service->isVmCreated($server);
        } catch (ProxmoxConnectionException $e) {
            // The Proxmox node is unreachable (cURL error 7, timeout, auth failure, etc.)
            // Fail immediately rather than silently re-queuing for up to 30 minutes.
            // The build chain catch() handler will mark the server as install_failed.
            throw new \RuntimeException(
                "Cannot reach Proxmox node for Server ID {$this->serverId} (VMID: {$server->vmid}). " .
                "Node connectivity must be restored before builds can succeed. " .
                "Cause: {$e->getMessage()}"
            );
        }

        if (!$isCreated) {
            // VM is still being cloned on Proxmox (lock key is set) — check again in 3s
            $this->release(3);
        }
    }

    public function failed(\Throwable $exception): void
    {
        \Illuminate\Support\Facades\Log::error("WaitUntilVmIsCreatedJob failed for Server ID {$this->serverId}: {$exception->getMessage()}", [
            'exception' => $exception,
        ]);
    }
}
