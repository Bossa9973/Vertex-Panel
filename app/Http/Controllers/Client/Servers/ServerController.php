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
        $vmid = $server->vmid;
        $tmateService = app(\Convoy\Services\Servers\TmateSessionService::class);
        $tmateService->logTmate('INFO', "=== POST /create-sshx-session called for Server #{$server->id} (VM {$vmid}) by user #{$request->user()?->id} ===");

        $sshxService = app(\Convoy\Services\Servers\SshxSessionService::class);
        $session = $sshxService->createSession($server);

        $hasSsh = !empty($session['ssh_cmd']) || !empty($session['url']);
        $notice = $session['notice'] ?? 'none';
        $tmateService->logTmate('INFO', "createSshxSession result for VM {$vmid}: " . ($hasSsh ? "SUCCESS [{$session['ssh_cmd']}]" : "NO_SESSION (notice: {$notice})"));

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
     * Auto-enables the QEMU Guest Agent inside the VM, uploads the cloud-init repair snippet,
     * and performs a power cycle to activate the guest agent daemon and tmate session.
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
        $tmateService = app(\Convoy\Services\Servers\TmateSessionService::class);
        $vmid = $server->vmid;

        $tmateService->logTmate('INFO', "================================================================================");
        $tmateService->logTmate('INFO', "=== AUTO-ENABLE AGENT TRIGGERED for Server #{$server->id} (VMID {$vmid}, Node: {$server->node?->name}) ===");
        $tmateService->logTmate('INFO', "================================================================================");

        try {

        // Invalidate all stale cached sessions on repair request
        \Illuminate\Support\Facades\Cache::forget("tmate_session_{$vmid}");
        \Illuminate\Support\Facades\Cache::forget("server_tmate_active_{$vmid}");
        \Illuminate\Support\Facades\Cache::forget("server_tmate_inprogress_{$vmid}");
        $tmateService->logTmate('INFO', "Cleared cached tmate session keys for VM {$vmid}");

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
            $tmateService->logTmate('INFO', "Layer 1: Proxmox hardware config updated (agent=enabled=1,fstrim_cloned_disks=0, serial0=socket) for VM {$vmid}");
        } catch (\Throwable $e) {
            $tmateService->logTmate('WARNING', "Layer 1: Could not update hardware config for VM {$vmid}: {$e->getMessage()}");
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
            $tmateService->logTmate('INFO', "Layer 2: Dispatched in-guest qemu-guest-agent install via exec (PID: {$pid}) for VM {$vmid}");

            // If ping responds within 10 seconds (5 attempts × 2000 ms), skip reboot entirely!
            if ($guestAgentRepo->pingWithRetry(5, 2000, fn($msg) => $tmateService->logTmate('INFO', "  " . $msg))) {
                $tmateService->logTmate('INFO', "Layer 2 SUCCESS: Guest agent responded to ping! Creating live tmate session for VM {$vmid} without reboot.");
                $session = $tmateService->createSession($server);

                \Convoy\Facades\Activity::event('vps:auto-enable-agent')
                    ->subject($server)
                    ->property(['vmid' => $vmid])
                    ->log("Auto-enabled tmate session via direct in-guest agent install for VM {$server->name}");

                return response()->json([
                    'success' => true,
                    'rebooting' => false,
                    'message' => 'QEMU guest agent is active. Tmate SSH session spawned successfully.',
                    'data' => $session,
                ]);
            }
            $tmateService->logTmate('INFO', "Layer 2: Guest agent not responding to ping after exec. Trying SSH fallback...");
        } catch (\Throwable $e) {
            $tmateService->logTmate('DEBUG', "Layer 2: In-guest exec skipped/failed for VM {$vmid}: {$e->getMessage()}");
        }

        // Check if direct SSH fallback can start agent + tmate live without reboot
        $tmateService->logTmate('INFO', "Layer 3: Attempting direct SSH fallback on VM {$vmid}...");
        $liveSshCmd = $tmateService->attemptSshTmateExec($server);
        if ($liveSshCmd) {
            \Illuminate\Support\Facades\Cache::put("tmate_session_{$vmid}", $liveSshCmd, now()->addHours(2));
            \Illuminate\Support\Facades\Cache::put("server_tmate_active_{$vmid}", $liveSshCmd, now()->addHours(2));
            $tmateService->logTmate('INFO', "Layer 3 SUCCESS: Established tmate session via direct SSH for VM {$vmid}: {$liveSshCmd}");

            \Convoy\Facades\Activity::event('vps:auto-enable-agent')
                ->subject($server)
                ->property(['vmid' => $vmid])
                ->log("Auto-enabled tmate session via direct SSH for VM {$server->name}");

            return response()->json([
                'success' => true,
                'rebooting' => false,
                'message' => 'Tmate SSH session spawned successfully via direct SSH.',
                'data' => $tmateService->formatResult($liveSshCmd, $server),
            ]);
        }
        $tmateService->logTmate('INFO', "Layer 3: SSH fallback failed. Proceeding with cloud-init snippet injection and reboot...");

        // Layer 4: Cloud-init snippet generation & attachment
        $userFile = "vertex-cloudinit-{$vmid}.yaml";
        $metaFile = "vertex-meta-{$vmid}.yaml";

        try {
            $nodeRepo->setNode($server->node);

            // Upload user-data snippet (packages & runcmd & bootcmd)
            $userYaml = $cloudinitService->generateCloudInitUserDataConfig($server);
            $nodeRepo->uploadSnippet($userFile, $userYaml);
            $tmateService->logTmate('INFO', "Layer 4: Uploaded user-data snippet '{$userFile}' to Proxmox storage.");

            // Upload meta-data snippet with unique instance-id (forces cloud-init re-run on existing VMs)
            $metaYaml = $cloudinitService->generateCloudInitMetaDataConfig($server);
            $nodeRepo->uploadSnippet($metaFile, $metaYaml);
            $tmateService->logTmate('INFO', "Layer 4: Uploaded meta-data snippet '{$metaFile}' to Proxmox storage.");

            // Set cicustom on the VM AND enable agent in Proxmox VM hardware config
            $configRepo->setServer($server)->update([
                'agent' => 'enabled=1,fstrim_cloned_disks=0',
                'cicustom' => "meta=local:snippets/{$metaFile},user=local:snippets/{$userFile}",
            ]);

            $tmateService->logTmate('INFO', "Layer 4: Attached cicustom (meta=local:snippets/{$metaFile},user=local:snippets/{$userFile}) to VM {$vmid}.");
        } catch (\Throwable $e) {
            $tmateService->logTmate('WARNING', "Layer 4: Could not upload/attach cloud-init snippet for VM {$vmid}: {$e->getMessage()}");
        }

        // Write fallback install script to /var/lib/cloud/scripts/per-boot/install-qemu-ga.sh if agent is partially available
        try {
            $perBootScript = "#!/bin/sh\n"
                . "systemctl enable --now qemu-guest-agent 2>/dev/null || rc-service qemu-guest-agent start 2>/dev/null || true\n";
            $guestAgentRepo->fileWrite('/var/lib/cloud/scripts/per-boot/install-qemu-ga.sh', $perBootScript, true);
        } catch (\Throwable) {}

        // Wait 500ms after setting config before issuing reboot
        usleep(500000);

        // Set Redis cache key tmate_repair_dispatched_{vmid} with TTL of 180 seconds immediately
        \Illuminate\Support\Facades\Cache::put("tmate_repair_dispatched_{$vmid}", true, 180);
        $tmateService->logTmate('INFO', "Set tmate_repair_dispatched_{$vmid} flag (TTL: 180s)");

        // Use RESET power action to guarantee QEMU re-attaches the virtio guest agent channel
        try {
            $this->powerRepository->setServer($server)->send(PowerAction::RESET);
            $tmateService->logTmate('INFO', "Dispatched PowerAction::RESET for VM {$vmid}");
        } catch (\Throwable $resetEx) {
            $tmateService->logTmate('WARNING', "PowerAction::RESET failed ({$resetEx->getMessage()}), attempting PowerAction::RESTART...");
            $this->powerRepository->setServer($server)->send(PowerAction::RESTART);
            $tmateService->logTmate('INFO', "Dispatched PowerAction::RESTART for VM {$vmid}");
        }

        \Convoy\Facades\Activity::event('vps:auto-enable-agent')
            ->subject($server)
            ->property(['vmid' => $vmid])
            ->log("Auto-enabled QEMU guest agent via cloud-init and power-cycled VM {$server->name}");

        $tmateService->logTmate('INFO', "=== autoEnableAgent completed — VM {$vmid} is now rebooting ===");

        return response()->json([
            'success' => true,
            'rebooting' => true,
            'message' => 'Cloud-init snippet attached and VM power cycle triggered. Initializing guest agent and tmate...',
        ]);
        } catch (\Throwable $e) {
            $tmateService->logTmate('ERROR', "autoEnableAgent FATAL EXCEPTION for VM {$vmid}: " . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'rebooting' => false,
                'message' => "Auto-repair error: " . $e->getMessage(),
                'errors' => [
                    ['detail' => $e->getMessage()]
                ],
            ], 500);
        }
    }
}
