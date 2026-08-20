<?php

namespace Convoy\Http\Controllers\Client\Servers;

use Convoy\Enums\Server\ConsoleType;
use Convoy\Enums\Server\PowerAction;
use Convoy\Http\Controllers\ApiController;
use Convoy\Http\Requests\Client\Servers\CreateConsoleSessionRequest;
use Convoy\Http\Requests\Client\Servers\SendPowerCommandRequest;
use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\ProxmoxNodeRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxConfigRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxPowerRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxServerRepository;
use Convoy\Services\Coterm\CotermJWTService;
use Convoy\Services\Servers\CloudinitService;
use Convoy\Services\Servers\ServerConsoleService;
use Convoy\Services\Servers\ServerDetailService;
use Convoy\Services\Servers\TmateSessionService;
use Convoy\Services\Servers\VncService;
use Convoy\Services\VertexTunnelService;
use Convoy\Transformers\Client\ServerDetailTransformer;
use Convoy\Transformers\Client\ServerStateTransformer;
use Convoy\Transformers\Client\ServerTerminalTransformer;
use Convoy\Transformers\Client\ServerTransformer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ServerController extends ApiController
{
    public function __construct(
        private CotermJWTService        $cotermJWTService,
        private ServerConsoleService    $consoleService,
        private ServerDetailService     $detailService,
        private ProxmoxServerRepository $serverRepository,
        private ProxmoxPowerRepository  $powerRepository,
        private VertexTunnelService     $tunnelService,
        private TmateSessionService     $tmateSessionService,
    )
    {
    }

    public function index(Server $server)
    {
        return fractal($server, new ServerTransformer())->respond();
    }

    public function details(Server $server)
    {
        return fractal(
            $this->detailService->getByProxmox($server), new ServerDetailTransformer(),
        )->respond();
    }

    public function getState(Server $server)
    {
        try {
            $state = \Illuminate\Support\Facades\Cache::remember("server.{$server->id}.state", 3, function () use ($server) {
                return $this->serverRepository->setServer($server)->getState();
            });
        } catch (\Throwable $e) {
            $state = \Convoy\Data\Server\Proxmox\ServerStateData::from([
                'state' => \Convoy\Enums\Server\State::STOPPED,
                'cpu_used' => 0.0,
                'memory_total' => 0,
                'memory_used' => 0,
                'uptime' => 0,
            ]);
        }

        $lastPower = \Illuminate\Support\Facades\Cache::get("server_last_power_action_{$server->vmid}");
        if ($lastPower) {
            $elapsed = now()->timestamp - (int) $lastPower;
            if ($elapsed >= 0 && $elapsed < 30) {
                $state->lockdown_seconds_remaining = 30 - $elapsed;
            }
        }

        return fractal()->item($state, new ServerStateTransformer())->respond();
    }

    public function updateState(Server $server, SendPowerCommandRequest $request)
    {
        \Illuminate\Support\Facades\Cache::forget("server.{$server->id}.state");

        $lastPowerAction = \Illuminate\Support\Facades\Cache::get("server_last_power_action_{$server->vmid}");
        if ($lastPowerAction) {
            $elapsed = now()->timestamp - (int) $lastPowerAction;
            if ($elapsed >= 0 && $elapsed < 30) {
                $remaining = 30 - $elapsed;
                return response()->json([
                    'errors' => [
                        [
                            'code'   => 'PowerActionRestrictedException',
                            'status' => '400',
                            'detail' => "Power actions are locked for 30 seconds after initiating a server state change to ensure system stability. Please wait {$remaining} second(s).",
                        ]
                    ]
                ], 400);
            }
        }

        $powerState = $request->enum('state', PowerAction::class);
        \Illuminate\Support\Facades\Cache::put("server_last_power_action_{$server->vmid}", now()->timestamp, now()->addMinutes(5));
        \Illuminate\Support\Facades\Cache::put("server_last_boot_{$server->vmid}", now()->timestamp, now()->addMinutes(10));

        // Mark tunnel offline on stop/kill/reboot so the port is re-polled after next boot
        if (in_array($powerState, [PowerAction::STOP, PowerAction::KILL, PowerAction::RESTART, PowerAction::RESET])) {
            $this->tunnelService->markOffline($server);
        }

        $this->powerRepository->setServer($server)
                              ->send($powerState);

        \Convoy\Facades\Activity::event("vps:power-{$powerState->value}")
            ->subject($server)
            ->property(['vmid' => $server->vmid, 'action' => $powerState->value, 'hostname' => $server->hostname])
            ->log("Triggered {$powerState->value} action on VPS server {$server->name}");

        return $this->returnNoContent();
    }

    public function createConsoleSession(CreateConsoleSessionRequest $request, Server $server)
    {
        $server->node->loadMissing('coterm');

        if ($coterm = $server->node->coterm) {
            return new JsonResponse([
                'data' => [
                    'is_tls_enabled' => $coterm->is_tls_enabled,
                    'fqdn'           => $coterm->fqdn,
                    'port'           => $coterm->port,
                    'token'          => $this->cotermJWTService->handle(
                        $server, $request->user(), $request->enum('type', ConsoleType::class),
                    )
                                                      ->toString(),
                ],
            ]);
        } else {
            $data = $this->consoleService->createConsoleUserCredentials($server);

            return fractal()->item([
                'ticket' => $data->ticket,
                'node'   => $server->node->cluster,
                'vmid'   => $server->vmid,
                'fqdn'   => $server->node->fqdn,
                'port'   => $server->node->port,
            ], new ServerTerminalTransformer())->respond();
        }
    }

    /**
     * Return the current admin-configured terminal console mode (both | sshx).
     */
    public function terminalMode(): JsonResponse
    {
        $setting = \Illuminate\Support\Facades\DB::table('settings')->where('key', 'terminal_console_mode')->first();
        $mode    = $setting && in_array($setting->value, ['both', 'sshx']) ? $setting->value : 'both';

        return response()->json([
            'success' => true,
            'data'    => ['mode' => $mode],
        ]);
    }

    /**
     * Spawn an on-demand tmate SSH session inside the VM via Proxmox QEMU Guest Agent.
     */
    public function tmateSession(Server $server): JsonResponse
    {
        $result = $this->tmateSessionService->createSession($server);

        return response()->json([
            'success' => true,
            'data'    => $result,
        ]);
    }

    /**
     * Return the current sish tunnel status and SSH string for this server.
     * If the tunnel is not yet active, attempt a live poll of the sish admin API
     * to catch tunnels that came up since the last cron run.
     */
    public function tunnel(Request $request, Server $server): JsonResponse
    {
        if ($server->tunnel_status !== 'active') {
            $this->tunnelService->pollAssignedPort($server);
            $server->refresh();
        }

        return response()->json([
            'ssh_string' => $this->tunnelService->sshString($server),
            'status'     => $server->tunnel_status,
            'port'       => $server->tunnel_port,
        ]);
    }

    /**
     * Auto-enables the QEMU Guest Agent inside the VM, uploads the cloud-init repair snippet,
     * and performs a power cycle to activate the guest agent daemon.
     */
    public function autoEnableAgent(
        Request $request,
        Server $server,
        ProxmoxConfigRepository $configRepo,
        ProxmoxNodeRepository $nodeRepo,
        CloudinitService $cloudinitService,
    ) {
        $guestAgentRepo = app(\Convoy\Repositories\Proxmox\Server\ProxmoxGuestAgentRepository::class);
        $guestAgentRepo->setServer($server);
        $vmid = $server->vmid;

        Log::info("================================================================================");
        Log::info("=== AUTO-ENABLE AGENT TRIGGERED for Server #{$server->id} (VMID {$vmid}, Node: {$server->node?->name}) ===");
        Log::info("================================================================================");

        try {

        // Layer 1: Explicitly set agent: enabled=1,fstrim_cloned_disks=0 and verify serial0 device
        try {
            $configRepo->setServer($server);
            $vmConfig = collect($configRepo->getConfig());
            $updates = [
                'agent' => 'enabled=1,fstrim_cloned_disks=0',
            ];
            if (!$vmConfig->contains('key', 'serial0')) {
                $updates['serial0'] = 'socket';
            }
            $configRepo->update($updates);
            Log::info("[AutoEnableAgent] Layer 1: Proxmox hardware config updated (agent=enabled=1,fstrim_cloned_disks=0, serial0=socket) for VM {$vmid}");
        } catch (\Throwable $e) {
            Log::warning("[AutoEnableAgent] Layer 1: Could not update hardware config for VM {$vmid}: {$e->getMessage()}");
        }

        // Layer 2: Attempt direct in-guest install via guest agent exec if agent is partially responsive
        try {
            $inGuestInstallCmd = "export PATH=\$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin; "
                . "(apt-get install -y qemu-guest-agent 2>/dev/null || "
                . "yum install -y qemu-guest-agent 2>/dev/null || "
                . "apk add qemu-guest-agent 2>/dev/null || "
                . "dnf install -y qemu-guest-agent 2>/dev/null || true); "
                . "(systemctl enable --now qemu-guest-agent 2>/dev/null || "
                . "rc-service qemu-guest-agent start 2>/dev/null || true)";

            $execRes = $guestAgentRepo->exec($inGuestInstallCmd);
            $pid = is_array($execRes) ? ($execRes['pid'] ?? 'ok') : 'ok';
            Log::info("[AutoEnableAgent] Layer 2: Dispatched in-guest qemu-guest-agent install via exec (PID: {$pid}) for VM {$vmid}");

            // If ping responds within 10 seconds (5 attempts × 2000 ms), skip reboot entirely
            if ($guestAgentRepo->pingWithRetry(5, 2000, fn($msg) => Log::info("[AutoEnableAgent]   " . $msg))) {
                Log::info("[AutoEnableAgent] Layer 2 SUCCESS: Guest agent responded to ping! VM {$vmid} is healthy without reboot.");

                \Convoy\Facades\Activity::event('vps:auto-enable-agent')
                    ->subject($server)
                    ->property(['vmid' => $vmid])
                    ->log("Auto-enabled QEMU guest agent via direct in-guest install for VM {$server->name}");

                return response()->json([
                    'success'  => true,
                    'rebooting'=> false,
                    'message'  => 'QEMU guest agent is active.',
                ]);
            }
            Log::info("[AutoEnableAgent] Layer 2: Guest agent not responding to ping after exec. Trying cloud-init repair...");
        } catch (\Throwable $e) {
            Log::debug("[AutoEnableAgent] Layer 2: In-guest exec skipped/failed for VM {$vmid}: {$e->getMessage()}");
        }

        // Layer 3: Cloud-init snippet generation & attachment
        $userFile = "vertex-cloudinit-{$vmid}.yaml";
        $metaFile = "vertex-meta-{$vmid}.yaml";

        try {
            $nodeRepo->setNode($server->node);

            // Upload user-data snippet (packages & runcmd & bootcmd)
            $userYaml = $cloudinitService->generateCloudInitUserDataConfig($server);
            $nodeRepo->uploadSnippet($userFile, $userYaml);
            Log::info("[AutoEnableAgent] Layer 3: Uploaded user-data snippet '{$userFile}' to Proxmox storage.");

            // Upload meta-data snippet with unique instance-id (forces cloud-init re-run on existing VMs)
            $metaYaml = $cloudinitService->generateCloudInitMetaDataConfig($server);
            $nodeRepo->uploadSnippet($metaFile, $metaYaml);
            Log::info("[AutoEnableAgent] Layer 3: Uploaded meta-data snippet '{$metaFile}' to Proxmox storage.");

            // Set cicustom on the VM AND enable agent in Proxmox VM hardware config
            $configRepo->setServer($server)->update([
                'agent'    => 'enabled=1,fstrim_cloned_disks=0',
                'cicustom' => "meta=local:snippets/{$metaFile},user=local:snippets/{$userFile}",
            ]);

            Log::info("[AutoEnableAgent] Layer 3: Attached cicustom (meta=local:snippets/{$metaFile},user=local:snippets/{$userFile}) to VM {$vmid}.");
        } catch (\Throwable $e) {
            Log::warning("[AutoEnableAgent] Layer 3: Could not upload/attach cloud-init snippet for VM {$vmid}: {$e->getMessage()}");
        }

        // Write fallback install script to /var/lib/cloud/scripts/per-boot/install-qemu-ga.sh if agent is partially available
        try {
            $perBootScript = "#!/bin/sh\n"
                . "systemctl enable --now qemu-guest-agent 2>/dev/null || rc-service qemu-guest-agent start 2>/dev/null || true\n";
            $guestAgentRepo->fileWrite('/var/lib/cloud/scripts/per-boot/install-qemu-ga.sh', $perBootScript, true);
        } catch (\Throwable) {}

        // Wait 500ms after setting config before issuing reboot
        usleep(500000);

        // Use RESET power action to guarantee QEMU re-attaches the virtio guest agent channel
        try {
            $this->powerRepository->setServer($server)->send(PowerAction::RESET);
            Log::info("[AutoEnableAgent] Dispatched PowerAction::RESET for VM {$vmid}");
        } catch (\Throwable $resetEx) {
            Log::warning("[AutoEnableAgent] PowerAction::RESET failed ({$resetEx->getMessage()}), attempting PowerAction::RESTART...");
            $this->powerRepository->setServer($server)->send(PowerAction::RESTART);
            Log::info("[AutoEnableAgent] Dispatched PowerAction::RESTART for VM {$vmid}");
        }

        \Convoy\Facades\Activity::event('vps:auto-enable-agent')
            ->subject($server)
            ->property(['vmid' => $vmid])
            ->log("Auto-enabled QEMU guest agent via cloud-init and power-cycled VM {$server->name}");

        Log::info("[AutoEnableAgent] === autoEnableAgent completed — VM {$vmid} is now rebooting ===");

        return response()->json([
            'success'   => true,
            'rebooting' => true,
            'message'   => 'Cloud-init snippet attached and VM power cycle triggered. Initializing guest agent...',
        ]);
        } catch (\Throwable $e) {
            Log::error("[AutoEnableAgent] FATAL EXCEPTION for VM {$vmid}: " . $e->getMessage(), [
                'file'  => $e->getFile(),
                'line'  => $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success'   => false,
                'rebooting' => false,
                'message'   => "Auto-repair error: " . $e->getMessage(),
                'errors'    => [
                    ['detail' => $e->getMessage()]
                ],
            ], 500);
        }
    }
}
