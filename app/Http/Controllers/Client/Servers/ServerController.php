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
use Convoy\Services\Servers\VncService;
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
                            'code' => 'PowerActionRestrictedException',
                            'status' => '400',
                            'detail' => "Power actions are locked for 30 seconds after initiating a server state change to ensure system stability and proper tmate initialization. Please wait {$remaining} second(s).",
                        ]
                    ]
                ], 400);
            }
        }

        $powerState = $request->enum('state', PowerAction::class);
        \Illuminate\Support\Facades\Cache::put("server_last_power_action_{$server->vmid}", now()->timestamp, now()->addMinutes(5));
        \Illuminate\Support\Facades\Cache::put("server_last_boot_{$server->vmid}", now()->timestamp, now()->addMinutes(10));
        // Flush tmate cache so next request always spawns a fresh session after power action
        \Illuminate\Support\Facades\Cache::forget("server_tmate_inprogress_{$server->vmid}");
        \Illuminate\Support\Facades\Cache::forget("server_tmate_ssh_{$server->vmid}"); // legacy key cleanup

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
        if ($request->input('type') === 'sshx') {
            return $this->createSshxSession($request, $server);
        }

        $server->node->loadMissing('coterm');

        if ($coterm = $server->node->coterm) {
            return new JsonResponse([
                'data' => [
                    'is_tls_enabled' => $coterm->is_tls_enabled,
                    'fqdn' => $coterm->fqdn,
                    'port' => $coterm->port,
                    'token' => $this->cotermJWTService->handle(
                        $server, $request->user(), $request->enum('type', ConsoleType::class),
                    )
                                                      ->toString(),
                ],
            ]);
        } else {
            $data = $this->consoleService->createConsoleUserCredentials($server);

            return fractal()->item([
                'ticket' => $data->ticket,
                'node' => $server->node->cluster,
                'vmid' => $server->vmid,
                'fqdn' => $server->node->fqdn,
                'port' => $server->node->port,
            ], new ServerTerminalTransformer())->respond();
        }
    }

    public function createSshxSession(Request $request, Server $server)
    {
        $sshxService = app(\Convoy\Services\Servers\SshxSessionService::class);
        $session = $sshxService->createSession($server);

        return response()->json([
            'success' => true,
            'data' => $session,
        ]);
    }

    public function sshxWebhook(Request $request, Server $server)
    {
        $user = $request->user();
        if (!$user || ($user->id !== $server->user_id && !$user->root_admin)) {
            return response()->json(['error' => 'Unauthorized access to server webhook.'], 403);
        }

        $request->validate([
            'url' => 'required|string|url',
        ]);

        $url = $request->input('url');
        \Illuminate\Support\Facades\Cache::put("server_sshx_url_{$server->vmid}", $url, now()->addHours(6));

        return response()->json([
            'success' => true,
            'message' => 'SSHX session URL received and stored.',
            'data' => [
                'vmid' => $server->vmid,
                'url' => $url,
            ],
        ]);
    }

    /**
     * Attaches the cloud-init user-data snippet to the VM so that qemu-guest-agent
     * and tmate are installed on next boot, then triggers a VM restart via Proxmox.
     *
     * Called when the user clicks "Auto-Enable & Reboot VM" in the tmate modal.
     * If guest agent is already active, spawns the tmate session directly without reboot.
     */
    public function autoEnableAgent(
        Request $request,
        Server $server,
        ProxmoxNodeRepository $nodeRepo,
        ProxmoxConfigRepository $configRepo,
        CloudinitService $cloudinitService,
    ) {
        $guestAgentRepo = app(\Convoy\Repositories\Proxmox\Server\ProxmoxGuestAgentRepository::class);
        $guestAgentRepo->setServer($server);
        $tmateService = app(\Convoy\Services\Servers\TmateSessionService::class);

        try {
            // 1. Ensure agent=1 is set in Proxmox VM hardware config
            $configRepo->setServer($server)->update([
                'agent' => 1,
            ]);
        } catch (\Throwable $e) {
            Log::debug("autoEnableAgent: Could not update agent setting: {$e->getMessage()}");
        }

        // 2. If guest agent is already active and responsive, spawn tmate session directly!
        if ($guestAgentRepo->ping()) {
            \Illuminate\Support\Facades\Cache::forget("server_tmate_active_{$server->vmid}");
            \Illuminate\Support\Facades\Cache::forget("server_tmate_inprogress_{$server->vmid}");

            $session = $tmateService->createSession($server);

            \Convoy\Facades\Activity::event('vps:auto-enable-agent')
                ->subject($server)
                ->property(['vmid' => $server->vmid])
                ->log("Auto-enabled tmate session via active QEMU guest agent for VM {$server->name}");

            return response()->json([
                'success' => true,
                'rebooting' => false,
                'message' => 'QEMU guest agent is active. Tmate SSH session spawned successfully.',
                'data' => $session,
            ]);
        }

        // 3. Fallback: check if direct SSH is reachable to start agent + tmate live without reboot
        $liveSshCmd = $tmateService->attemptSshTmateExec($server);
        if ($liveSshCmd) {
            \Illuminate\Support\Facades\Cache::put("server_tmate_active_{$server->vmid}", $liveSshCmd, now()->addHours(2));

            \Convoy\Facades\Activity::event('vps:auto-enable-agent')
                ->subject($server)
                ->property(['vmid' => $server->vmid])
                ->log("Auto-enabled tmate session via direct SSH for VM {$server->name}");

            return response()->json([
                'success' => true,
                'rebooting' => false,
                'message' => 'Tmate SSH session spawned successfully via direct SSH.',
                'data' => $tmateService->formatResult($liveSshCmd, $server),
            ]);
        }

        // 4. If neither is reachable, attach cloud-init snippets with unique instance-id and power cycle
        $userFile = "vertex-cloudinit-{$server->vmid}.yaml";
        $metaFile = "vertex-meta-{$server->vmid}.yaml";

        try {
            $nodeRepo->setNode($server->node);

            // Upload user-data snippet (packages & runcmd)
            $userYaml = $cloudinitService->generateCloudInitUserDataConfig($server);
            $nodeRepo->uploadSnippet($userFile, $userYaml);

            // Upload meta-data snippet with unique instance-id (forces cloud-init re-run on existing VMs)
            $metaYaml = $cloudinitService->generateCloudInitMetaDataConfig($server);
            $nodeRepo->uploadSnippet($metaFile, $metaYaml);

            // Set cicustom on the VM AND enable agent=1 in Proxmox VM hardware config
            $configRepo->setServer($server)->update([
                'agent' => 1,
                'cicustom' => "meta=local:snippets/{$metaFile},user=local:snippets/{$userFile}",
            ]);

            Log::info("autoEnableAgent: Cloud-init meta & user snippets attached to VM {$server->vmid} via Proxmox API.");
        } catch (\Throwable $e) {
            Log::warning("autoEnableAgent: Could not upload snippet for VM {$server->vmid}: {$e->getMessage()}");
        }

        // Flush stale tmate cache
        \Illuminate\Support\Facades\Cache::forget("server_tmate_active_{$server->vmid}");
        \Illuminate\Support\Facades\Cache::forget("server_tmate_inprogress_{$server->vmid}");

        // Use RESET power action to guarantee QEMU re-attaches the virtio guest agent channel
        try {
            $this->powerRepository->setServer($server)->send(PowerAction::RESET);
        } catch (\Throwable) {
            $this->powerRepository->setServer($server)->send(PowerAction::RESTART);
        }

        \Convoy\Facades\Activity::event('vps:auto-enable-agent')
            ->subject($server)
            ->property(['vmid' => $server->vmid])
            ->log("Auto-enabled QEMU guest agent via cloud-init and power-cycled VM {$server->name}");

        return response()->json([
            'success' => true,
            'rebooting' => true,
            'message' => 'Cloud-init snippet attached and VM power cycle triggered. Initializing guest agent and tmate...',
        ]);
    }
}
