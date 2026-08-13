<?php

namespace Convoy\Services\Servers;

use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\ProxmoxNodeRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxConfigRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxGuestAgentRepository;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class TmateSessionService
{
    public function __construct(
        private ProxmoxGuestAgentRepository $guestAgentRepository,
        private ServerConsoleService $consoleService,
        private ProxmoxNodeRepository $nodeRepository,
        private CloudinitService $cloudinitService,
        private ProxmoxConfigRepository $configRepository,
    ) {
    }

    /**
     * Spawns an on-demand tmate SSH session inside the VM via Proxmox QEMU Guest Agent,
     * or falls back seamlessly to Proxmox Web Console if QEMU agent is not active.
     */
    public function createSession(Server $server): array
    {
        // 0. Check for an existing active tmate session in cache for instant reconnect
        $cachedSsh = Cache::get("server_tmate_active_{$server->vmid}");
        if ($cachedSsh && is_string($cachedSsh) && !empty($cachedSsh)) {
            return $this->formatResult($cachedSsh, $server);
        }

        // 0a. Restrict tmate session launch during first 5 minutes (300 seconds) after server creation
        if ($server->created_at) {
            $secondsSinceCreation = $server->created_at->diffInSeconds(now(), false);
            if ($secondsSinceCreation >= 0 && $secondsSinceCreation < 300) {
                $remainingSeconds = 300 - (int) $secondsSinceCreation;
                $minutes = (int) ceil($remainingSeconds / 60);

                $notice = "tmate terminal access is restricted for the first 5 minutes after server creation to ensure Cloud-Init finishes initial system setup and package configuration properly. Please wait approximately {$minutes} minute(s) ({$remainingSeconds}s remaining).";

                return $this->getFallbackConsoleResult($server, $notice, true, $remainingSeconds);
            }
        }

        // 0b. Restrict tmate session launch during first 30 seconds after server boot/power action
        $lastPowerAction = Cache::get("server_last_power_action_{$server->vmid}") ?? Cache::get("server_last_boot_{$server->vmid}");
        if ($lastPowerAction) {
            $elapsedSincePower = now()->timestamp - (int) $lastPowerAction;
            if ($elapsedSincePower >= 0 && $elapsedSincePower < 30) {
                $remainingSeconds = 30 - $elapsedSincePower;

                $notice = "tmate terminal access is temporarily restricted for 30 seconds after server boot/power action to allow system services and QEMU guest agent to initialize properly. Please wait {$remainingSeconds} second(s).";

                return $this->getFallbackConsoleResult($server, $notice, true, $remainingSeconds);
            }
        }

        // 0c. Enforce 15-second cooldown between requesting new tmate SSH sessions
        $lastTmateReq = Cache::get("server_last_tmate_req_{$server->vmid}");
        if ($lastTmateReq) {
            $elapsedSinceReq = now()->timestamp - (int) $lastTmateReq;
            if ($elapsedSinceReq >= 0 && $elapsedSinceReq < 15) {
                $remainingSeconds = 15 - $elapsedSinceReq;

                $notice = "A brief 15-second cooldown is enforced between requesting new tmate SSH sessions. Please wait {$remainingSeconds} second(s).";

                return $this->getFallbackConsoleResult($server, $notice, true, $remainingSeconds);
            }
        }

        // Record timestamp of this new tmate SSH session request
        Cache::put("server_last_tmate_req_{$server->vmid}", now()->timestamp, now()->addMinutes(5));

        $dedupKey = "server_tmate_inprogress_{$server->vmid}";

        // 1. Short dedup guard — if a spawn is already in-flight from a concurrent request, wait briefly
        if (Cache::get($dedupKey)) {
            usleep(2000000); // wait 2.0 s
        }

        Cache::put($dedupKey, true, now()->addSeconds(2));

        // 2. Proxmox QEMU Guest Agent — attempt tmate execution directly
        $sshCmd = $this->attemptProxmoxTmateExec($server, $errorNotice);

        // 3. Fallback: attempt direct SSH
        if (!$sshCmd) {
            $sshCmd = $this->attemptSshTmateExec($server);
        }

        Cache::forget($dedupKey);

        if ($sshCmd) {
            // Cache active SSH session for 2 hours for instant reconnect
            Cache::put("server_tmate_active_{$server->vmid}", $sshCmd, now()->addHours(2));
            return $this->formatResult($sshCmd, $server);
        }

        // 4. If agent was absent, auto-attach snippet so reboot installs it
        $this->ensureCloudInitSnippetAttached($server);

        $notice = $errorNotice ?: "QEMU Guest Agent is not active inside this VM operating system yet. You can open Web Console (noVNC) directly below, or click 'Auto-Enable & Reboot VM'.";
        return $this->getFallbackConsoleResult($server, $notice);
    }

    /**
     * Executes the exact tmate command via Proxmox QEMU Guest Agent and reads /tmp/tmate.log.
     */
    private function attemptProxmoxTmateExec(Server $server, ?string &$errorNotice = null): ?string
    {
        try {
            $this->guestAgentRepository->setServer($server);

            // Super-refined tmate launcher & self-healing daemon script:
            //  1. Ensure /tmp permissions
            //  2. Reload systemd and guarantee qemu-guest-agent stays active
            //  3. Clean up stale sessions
            //  4. Auto-install tmate across any distro if missing
            //  5. Start detached session with explicit socket
            //  6. Wait until tmate connection is established
            //  7. Extract SSH connection string to /tmp/tmate.log
            $execCmd = "export PATH=\$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin; "
                . "chmod 1777 /tmp 2>/dev/null || true; "
                . "systemctl daemon-reload >/dev/null 2>&1 || true; "
                . "systemctl enable --now qemu-guest-agent >/dev/null 2>&1 || true; "
                . "systemctl start qemu-guest-agent >/dev/null 2>&1 || true; "
                . "service qemu-guest-agent start >/dev/null 2>&1 || true; "
                . "pkill -9 -f tmate >/dev/null 2>&1 || true; "
                . "rm -f /tmp/tmate.sock /tmp/tmate.log /tmp/tmate_err.log; "
                . "if ! command -v tmate >/dev/null 2>&1; then "
                . "  if command -v apt-get >/dev/null 2>&1; then "
                . "    DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 || true; "
                . "    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tmate >/dev/null 2>&1 || true; "
                . "  elif command -v apk >/dev/null 2>&1; then "
                . "    apk add --no-cache tmate >/dev/null 2>&1 || true; "
                . "  elif command -v dnf >/dev/null 2>&1; then "
                . "    dnf install -y tmate >/dev/null 2>&1 || true; "
                . "  elif command -v yum >/dev/null 2>&1; then "
                . "    yum install -y tmate >/dev/null 2>&1 || true; "
                . "  elif command -v pacman >/dev/null 2>&1; then "
                . "    pacman -Sy --noconfirm tmate >/dev/null 2>&1 || true; "
                . "  fi; "
                . "fi; "
                . "tmate -S /tmp/tmate.sock new-session -d 2>/tmp/tmate_err.log || true; "
                . "tmate -S /tmp/tmate.sock wait tmate-ready 2>/dev/null || true; "
                . "tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' > /tmp/tmate.log 2>/dev/null || true";

            // Execute command via Proxmox QEMU Guest Agent API (fire-and-forget)
            $this->guestAgentRepository->exec($execCmd);

            // Poll /tmp/tmate.log for up to 30 seconds (60 × 500 ms).
            // Since `tmate wait tmate-ready` runs inside the VM first, the SSH string
            // should appear shortly after the file is written.
            for ($attempt = 1; $attempt <= 60; $attempt++) {
                usleep(500000); // 500 ms

                try {
                    $fileData = $this->guestAgentRepository->fileRead('/tmp/tmate.log');
                    $content = is_array($fileData) ? ($fileData['content'] ?? '') : (string) $fileData;

                    // Proxmox file-read returns base64-encoded content
                    if ($content && base64_encode(base64_decode($content, true)) === $content) {
                        $decoded = base64_decode($content);
                        if (mb_check_encoding($decoded, 'UTF-8')) {
                            $content = $decoded;
                        }
                    }

                    $sshCmd = trim((string) $content);

                    if (!empty($sshCmd) && (Str::startsWith($sshCmd, 'ssh ') || Str::contains($sshCmd, '@tmate.io'))) {
                        Log::info("Tmate session established for VM {$server->vmid} on poll attempt {$attempt}");
                        return $sshCmd;
                    }
                } catch (\Throwable) {
                    // /tmp/tmate.log not written yet — keep waiting
                }
            }

            // After 30 s without a result, check tmate's own error log for diagnosis
            try {
                $errData = $this->guestAgentRepository->fileRead('/tmp/tmate_err.log');
                $errContent = is_array($errData) ? ($errData['content'] ?? '') : (string) $errData;
                if ($errContent && base64_encode(base64_decode($errContent, true)) === $errContent) {
                    $errContent = base64_decode($errContent);
                }
                $errContent = trim((string) $errContent);
                if (!empty($errContent)) {
                    Log::warning("Tmate launch failed for VM {$server->vmid}. tmate stderr: {$errContent}");
                    $errorNotice = 'tmate could not connect to tmate.io. Error: ' . Str::limit($errContent, 120);
                }
            } catch (\Throwable) {
                // tmate_err.log may not exist if tmate wasn't installed
            }
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            Log::error("Proxmox Tmate Guest Agent Exec error for VM {$server->vmid}: {$msg}");

            if (Str::containsAny($msg, ['not running', 'Agent', 'agent', '500', 'connection', 'Communication'])) {
                $errorNotice = "QEMU Guest Agent is not responding. Please ensure 'qemu-guest-agent' is installed and running inside the VM.";
            } else {
                $errorNotice = "Guest Agent execution error: {$msg}";
            }
        }

        return null;
    }


    private function formatResult(string $sshCmd, Server $server): array
    {
        return [
            'ssh_cmd' => $sshCmd,
            'url' => $sshCmd,
            'server_vmid' => $server->vmid,
            'server_uuid' => $server->uuid,
            'server_name' => $server->name,
        ];
    }

    /**
     * Generates automatic Proxmox Web Console credentials as a 100% reliable fallback when QEMU guest agent is inactive.
     */
    private function getFallbackConsoleResult(Server $server, string $notice, bool $restricted = false, int $remainingSeconds = 0): array
    {
        $result = [
            'ssh_cmd'           => null,
            'url'               => null,
            'notice'            => $notice,
            'restricted'        => $restricted,
            'remaining_seconds' => $remainingSeconds,
            'fallback_console'  => true,
            'server_vmid'       => $server->vmid,
            'server_uuid'       => $server->uuid,
            'server_name'       => $server->name,
        ];

        try {
            $credentials = $this->consoleService->createConsoleUserCredentials($server);
            $result['console_ticket'] = $credentials->ticket;
            $result['console_vmid']   = $server->vmid;
            $result['console_node']   = $server->node->cluster;
            $result['console_fqdn']   = $server->node->fqdn;
            $result['console_port']   = $server->node->port;
        } catch (\Throwable $ex) {
            Log::warning("Could not generate fallback console ticket for server {$server->id}: " . $ex->getMessage());
        }

        return $result;
    }

    /**
     * Ensures cloud-init user-data snippet is uploaded and attached to cicustom for legacy VMs
     * so that a reboot will automatically install qemu-guest-agent + tmate on boot.
     */
    private function ensureCloudInitSnippetAttached(Server $server): void
    {
        try {
            $filename = "vertex-cloudinit-{$server->vmid}.yaml";
            $yaml = $this->cloudinitService->generateCloudInitUserDataConfig($server);

            $this->nodeRepository->setNode($server->node);
            $this->nodeRepository->uploadSnippet($filename, $yaml);

            $this->configRepository->setServer($server)->update([
                'cicustom' => "user=local:snippets/{$filename}",
            ]);

            Log::info("Auto-attached cloud-init snippet for legacy VM {$server->vmid} on tmate request.");
        } catch (\Throwable $e) {
            Log::debug("Could not auto-attach snippet for legacy VM {$server->vmid}: {$e->getMessage()}");
        }
    }

    /**
     * Attempts direct SSH connection into the VM to auto-install qemu-guest-agent + tmate
     * and retrieve the live tmate SSH command when Proxmox QEMU Agent is not yet active.
     */
    private function attemptSshTmateExec(Server $server): ?string
    {
        try {
            // 1. Get primary IP address of the server
            $server->loadMissing('addresses');
            $primaryAddress = $server->addresses->where('is_primary', true)->first()
                ?? $server->addresses->first();

            $ip = $primaryAddress?->address;
            if (empty($ip)) {
                return null;
            }

            // 2. Retrieve root password from Proxmox cloud-init config
            $config = collect($this->configRepository->setServer($server)->getConfig());
            $password = $config->where('key', '=', 'cipassword')->first()['value'] ?? null;

            if (empty($password)) {
                return null;
            }

            // 3. Connect via phpseclib3 SSH2 with a 4s connection timeout
            $ssh = new \phpseclib3\Net\SSH2($ip, 22, 4);
            $ssh->setTimeout(20);

            if (!$ssh->login('root', $password)) {
                return null;
            }

            // 4. Execute self-healing setup and tmate launcher
            $cmd = 'export PATH=$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin; '
                . 'chmod 1777 /tmp 2>/dev/null || true; '
                . 'if ! command -v qemu-ga >/dev/null 2>&1; then '
                . '  DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 || true; '
                . '  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq qemu-guest-agent >/dev/null 2>&1 || true; '
                . 'fi; '
                . 'systemctl daemon-reload >/dev/null 2>&1 || true; '
                . 'systemctl enable --now qemu-guest-agent >/dev/null 2>&1 || true; '
                . 'systemctl start qemu-guest-agent >/dev/null 2>&1 || true; '
                . 'if ! command -v tmate >/dev/null 2>&1; then '
                . '  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tmate >/dev/null 2>&1 || true; '
                . 'fi; '
                . 'pkill -9 -f tmate >/dev/null 2>&1 || true; '
                . 'rm -f /tmp/tmate.sock /tmp/tmate.log; '
                . 'tmate -S /tmp/tmate.sock new-session -d 2>/dev/null || true; '
                . 'tmate -S /tmp/tmate.sock wait tmate-ready 2>/dev/null || true; '
                . 'tmate -S /tmp/tmate.sock display -p "#{tmate_ssh}" 2>/dev/null || true';

            $output = trim((string) $ssh->exec($cmd));

            if (!empty($output)) {
                $lines = explode("\n", $output);
                foreach ($lines as $line) {
                    $line = trim($line);
                    if (Str::startsWith($line, 'ssh ') || Str::contains($line, '@tmate.io')) {
                        Log::info("Tmate session successfully spawned via direct SSH fallback for VM {$server->vmid}");

                        // Also ensure agent: 1 is enabled in Proxmox hardware config
                        try {
                            $this->configRepository->setServer($server)->update(['agent' => 1]);
                        } catch (\Throwable) {}

                        return $line;
                    }
                }
            }
        } catch (\Throwable $e) {
            Log::debug("attemptSshTmateExec fallback failed for VM {$server->vmid}: {$e->getMessage()}");
        }

        return null;
    }
}
