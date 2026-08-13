<?php

namespace Convoy\Console\Commands\Server;

use Convoy\Enums\Server\Status;
use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\ProxmoxNodeRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxConfigRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxGuestAgentRepository;
use Convoy\Services\Servers\CloudinitService;
use Convoy\Services\Servers\TmateSessionService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Scheduled command that runs every 5 minutes:
 *  1. Iterates over all active running VPS servers.
 *  2. Pings QEMU guest agent; if responding, enforces systemctl enable --now qemu-guest-agent.
 *  3. Spawns and pre-caches active tmate SSH links in Redis (server_tmate_active_{vmid})
 *     so users get instant 0ms access when clicking tmate.
 *  4. If QEMU guest agent is absent on legacy VMs, auto-attaches cloud-init user-data snippet
 *     so guest agent + tmate are installed automatically on next VM boot.
 */
class KeepQemuAgentAndTmateAliveCommand extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'convoy:keep-tmate-alive';

    /**
     * The console command description.
     */
    protected $description = 'Keeps QEMU guest agent alive across all VMs and pre-caches tmate SSH links every 5 minutes';

    public function handle(
        ProxmoxGuestAgentRepository $guestAgentRepo,
        ProxmoxConfigRepository $configRepo,
        ProxmoxNodeRepository $nodeRepo,
        CloudinitService $cloudinitService,
        TmateSessionService $tmateService,
    ): void {
        $servers = Server::where(function ($query) {
            $query->whereNull('status')
                ->orWhere('status', '!=', Status::INSTALLING->value);
        })->get();

        $count = 0;
        $activeTmate = 0;

        foreach ($servers as $server) {
            try {
                $guestAgentRepo->setServer($server);

                if ($guestAgentRepo->ping()) {
                    // 1. Keep QEMU guest agent service alive and enabled inside VM
                    try {
                        $guestAgentRepo->exec(
                            'systemctl enable --now qemu-guest-agent >/dev/null 2>&1 || true; ' .
                            'systemctl start qemu-guest-agent >/dev/null 2>&1 || true'
                        );
                    } catch (\Throwable) {
                        // ignore minor exec errors if daemon is already running
                    }

                    // 2. Pre-spawn and cache active tmate SSH session in Redis
                    $result = $tmateService->createSession($server);
                    if (!empty($result['ssh_cmd'])) {
                        $activeTmate++;
                    }

                    $count++;
                } else {
                    // 3. If guest agent is missing/inactive on legacy VM, auto-attach cloud-init snippet
                    $filename = "vertex-cloudinit-{$server->vmid}.yaml";
                    $yaml = $cloudinitService->generateCloudInitUserDataConfig($server);

                    try {
                        $nodeRepo->setNode($server->node);
                        $nodeRepo->uploadSnippet($filename, $yaml);

                        $configRepo->setServer($server)->update([
                            'cicustom' => "user=local:snippets/{$filename}",
                        ]);
                    } catch (\Throwable) {
                        // ignore snippet upload errors if storage/permissions differ
                    }
                }
            } catch (\Throwable $e) {
                Log::debug("KeepQemuAgentAndTmateAliveCommand error for server {$server->id} (VM {$server->vmid}): {$e->getMessage()}");
            }
        }

        $this->info("KeepQemuAgentAndTmateAliveCommand: Processed {$count}/{$servers->count()} active servers ({$activeTmate} tmate sessions cached).");
    }
}
