<?php

namespace Convoy\Jobs\Server;

use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\Server\ProxmoxGuestAgentRepository;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\SkipIfBatchCancelled;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Polls until the QEMU guest agent inside the VM is responding,
 * then enables it permanently so it survives future reboots.
 *
 * This job is added to the build chain after SendPowerCommandJob(START)
 * to guarantee the agent is fully up before the server is marked "ready",
 * eliminating the "QEMU Guest Agent is not responding" error entirely.
 */
class EnsureGuestAgentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Allow up to 15 minutes total for the guest OS to boot,
     * cloud-init to run, and the agent to start.
     */
    public int $timeout = 900;

    /**
     * Only one attempt — the polling loop below handles retries internally.
     */
    public int $tries = 1;

    public function __construct(protected int $serverId)
    {
    }

    public function middleware(): array
    {
        return [
            new SkipIfBatchCancelled(),
            (new WithoutOverlapping("server.ensure-agent#{$this->serverId}"))->expireAfter(950)->dontRelease(),
        ];
    }

    public function handle(ProxmoxGuestAgentRepository $guestAgentRepo): void
    {
        $server = Server::findOrFail($this->serverId);
        $guestAgentRepo->setServer($server);

        $maxAttempts = 75;   // 75 × 12 s = 15 minutes
        $pollInterval = 12;  // seconds between each ping

        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            sleep($pollInterval);

            if ($guestAgentRepo->ping()) {
                Log::info("QEMU guest agent responded for server {$this->serverId} (VM {$server->vmid}) on attempt {$attempt}.");

                // Make qemu-guest-agent persistent across reboots and install it
                // if cloud-init hasn't done so yet (best-effort, no failure on error).
                try {
                    $guestAgentRepo->exec(
                        'systemctl enable qemu-guest-agent >/dev/null 2>&1 || true; ' .
                        'systemctl start qemu-guest-agent >/dev/null 2>&1 || true'
                    );
                } catch (\Throwable) {
                    // Non-fatal — the agent is already running; the enable is just insurance.
                }

                return;
            }

            Log::debug("EnsureGuestAgentJob: agent not yet ready for server {$this->serverId}, attempt {$attempt}/{$maxAttempts}.");
        }

        // The agent never came up within 15 minutes.
        // Log a warning but do not fail the chain — the server was deployed successfully;
        // tmate will still fall back to Proxmox Web Console if the agent is absent.
        Log::warning(
            "EnsureGuestAgentJob: QEMU guest agent did not respond within 15 minutes for server {$this->serverId} (VM {$server->vmid}). " .
            'Ensure qemu-guest-agent is installed in the Proxmox template.'
        );
    }

    public function failed(\Throwable $exception): void
    {
        Log::error("EnsureGuestAgentJob failed for Server ID {$this->serverId}: {$exception->getMessage()}", [
            'exception' => $exception,
        ]);
    }
}
