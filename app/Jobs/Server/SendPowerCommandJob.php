<?php

namespace Convoy\Jobs\Server;

use Convoy\Enums\Server\PowerAction;
use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\Server\ProxmoxPowerRepository;
use Illuminate\Bus\Batchable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\SkipIfBatchCancelled;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;

class SendPowerCommandJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, Batchable;

    public int $tries = 3;

    public int $timeout = 60;

    public function __construct(protected int $serverId, protected PowerAction $power)
    {
    }

    public function middleware(): array
    {
        return [new SkipIfBatchCancelled(), new WithoutOverlapping(
            "server.send-power-command#{$this->serverId}",
        )];
    }

    public function handle(ProxmoxPowerRepository $repository): void
    {
        $server = Server::findOrFail($this->serverId);

        try {
            $repository->setServer($server)->send($this->power);
        } catch (\Throwable $e) {
            // When killing/stopping a VM during deletion, if it's already stopped, not running, or doesn't exist on Proxmox, proceed
            if ($this->power === PowerAction::KILL) {
                $msg = strtolower($e->getMessage());
                if (
                    str_contains($msg, 'not running') ||
                    str_contains($msg, 'already stopped') ||
                    str_contains($msg, 'does not exist') ||
                    str_contains($msg, 'not found') ||
                    str_contains($msg, '404')
                ) {
                    \Illuminate\Support\Facades\Log::info("SendPowerCommandJob: VM {$server->vmid} already stopped or absent on Proxmox ({$e->getMessage()}), proceeding.");
                    return;
                }
            }
            throw $e;
        }
    }

    public function failed(\Throwable $exception): void
    {
        \Illuminate\Support\Facades\Log::error("SendPowerCommandJob failed for Server ID {$this->serverId}: {$exception->getMessage()}", [
            'powerAction' => $this->power->value ?? 'unknown',
            'exception' => $exception,
        ]);
    }
}
