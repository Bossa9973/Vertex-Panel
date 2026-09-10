<?php

namespace Convoy\Jobs\Server;

use Closure;
use Convoy\Enums\Server\State;
use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\Server\ProxmoxServerRepository;
use Illuminate\Bus\Batchable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\SkipIfBatchCancelled;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;

class MonitorStateJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, Batchable;

    public function retryUntil(): Carbon
    {
        return now()->addMinutes(2);
    }

    public function __construct(
        protected int      $serverId,
        protected State    $targetState,
        protected ?Closure $callback = null,
    )
    {
        //
    }

    public function middleware(): array
    {
        return [new SkipIfBatchCancelled()];
    }

    public function handle(ProxmoxServerRepository $repository): void
    {
        $server = Server::findOrFail($this->serverId);

        if ($this->attempts() >= 40) {
            throw new \RuntimeException("VM state transition timed out for Server ID {$server->id} (VMID: {$server->vmid}) waiting for state: {$this->targetState->value}.");
        }

        try {
            $stateData = $repository->setServer($server)->getState();
        } catch (\Throwable $e) {
            $msg = strtolower($e->getMessage());
            if ($this->targetState === State::STOPPED && (
                str_contains($msg, 'does not exist') ||
                str_contains($msg, 'not found') ||
                str_contains($msg, '404')
            )) {
                \Illuminate\Support\Facades\Log::info("MonitorStateJob: VM {$server->vmid} no longer exists on Proxmox, treating as stopped.");
                if ($this->callback !== null) {
                    call_user_func($this->callback);
                }
                return;
            }
            throw $e;
        }

        if ($stateData->state === $this->targetState) {
            if ($this->callback !== null) {
                call_user_func($this->callback);
            }
        } else {
            $this->release(3);
        }
    }
}
