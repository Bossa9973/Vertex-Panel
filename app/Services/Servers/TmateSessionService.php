<?php

namespace Convoy\Services\Servers;

use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\Server\ProxmoxGuestAgentRepository;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class TmateSessionService
{
    public function __construct(private ProxmoxGuestAgentRepository $guestAgentRepository)
    {
    }

    /**
     * Spawns an on-demand tmate SSH session inside the VM via Proxmox QEMU Guest Agent.
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

                return [
                    'ssh_cmd' => null,
                    'url' => null,
                    'notice' => $notice,
                    'restricted' => true,
                    'remaining_seconds' => $remainingSeconds,
                ];
            }
        }

        // 0b. Restrict tmate session launch during first 30 seconds after server boot/power action
        $lastPowerAction = Cache::get("server_last_power_action_{$server->vmid}") ?? Cache::get("server_last_boot_{$server->vmid}");
        if ($lastPowerAction) {
            $elapsedSincePower = now()->timestamp - (int) $lastPowerAction;
            if ($elapsedSincePower >= 0 && $elapsedSincePower < 30) {
                $remainingSeconds = 30 - $elapsedSincePower;

                $notice = "tmate terminal access is temporarily restricted for 30 seconds after server boot/power action to allow system services and QEMU guest agent to initialize properly. Please wait {$remainingSeconds} second(s).";

                return [
                    'ssh_cmd' => null,
                    'url' => null,
                    'notice' => $notice,
                    'restricted' => true,
                    'remaining_seconds' => $remainingSeconds,
                ];
            }
        }

        // 0c. Enforce 15-second cooldown between requesting new tmate SSH sessions
        $lastTmateReq = Cache::get("server_last_tmate_req_{$server->vmid}");
        if ($lastTmateReq) {
            $elapsedSinceReq = now()->timestamp - (int) $lastTmateReq;
            if ($elapsedSinceReq >= 0 && $elapsedSinceReq < 15) {
                $remainingSeconds = 15 - $elapsedSinceReq;

                $notice = "A brief 15-second cooldown is enforced between requesting new tmate SSH sessions. Please wait {$remainingSeconds} second(s).";

                return [
                    'ssh_cmd' => null,
                    'url' => null,
                    'notice' => $notice,
                    'restricted' => true,
                    'remaining_seconds' => $remainingSeconds,
                ];
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

        // 2. Pre-check Proxmox QEMU Guest Agent connectivity
        $this->guestAgentRepository->setServer($server);
        if (!$this->guestAgentRepository->ping()) {
            Cache::forget($dedupKey);

            $notice = "QEMU Guest Agent is not responding inside this VM. Please ensure 'qemu-guest-agent' is installed and running inside your operating system (sudo apt update && sudo apt install -y qemu-guest-agent && sudo systemctl enable --now qemu-guest-agent), or use the Web Console.";

            return [
                'ssh_cmd' => null,
                'url' => null,
                'notice' => $notice,
                'restricted' => false,
            ];
        }

        // 3. Proxmox QEMU Guest Agent — execute tmate installer & session spawner
        $sshCmd = $this->attemptProxmoxTmateExec($server, $errorNotice);

        Cache::forget($dedupKey);

        if ($sshCmd) {
            // Cache active SSH session for 2 hours for instant reconnect
            Cache::put("server_tmate_active_{$server->vmid}", $sshCmd, now()->addHours(2));
            return $this->formatResult($sshCmd, $server);
        }

        // 4. Return diagnostic notice if execution failed or timed out
        $notice = $errorNotice ?: "QEMU Guest Agent timed out while launching tmate. Please verify network connectivity inside the VM and try again.";
        return $this->formatResult($notice, $server);
    }

    /**
     * Executes the exact tmate command via Proxmox QEMU Guest Agent and reads /tmp/tmate.log.
     */
    private function attemptProxmoxTmateExec(Server $server, ?string &$errorNotice = null): ?string
    {
        try {
            $this->guestAgentRepository->setServer($server);

            // Multi-distro auto-installer, systemd agent enabler & robust tmate session spawner
            $execCmd = "export PATH=\$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin; "
                . "systemctl enable --now qemu-guest-agent >/dev/null 2>&1 || true; "
                . "pkill -9 tmate >/dev/null 2>&1 || true; "
                . "rm -f /tmp/tmate.sock /tmp/tmate.log; "
                . "if ! command -v tmate >/dev/null 2>&1; then "
                . "  if command -v apt-get >/dev/null 2>&1; then "
                . "    for attempt in 1 2 3; do "
                . "      (DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tmate) >/dev/null 2>&1 || true; "
                . "      if command -v tmate >/dev/null 2>&1; then break; fi; "
                . "      sleep 1; "
                . "    done; "
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
                . "tmate -S /tmp/tmate.sock new-session -d >/dev/null 2>&1 || true; "
                . "for i in $(seq 1 40); do "
                . "  tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' > /tmp/tmate.log 2>/dev/null || true; "
                . "  if grep -q '@' /tmp/tmate.log 2>/dev/null; then break; fi; "
                . "  sleep 0.3; "
                . "done";

            // Execute command via Proxmox QEMU Guest Agent API
            $this->guestAgentRepository->exec($execCmd);

            // Poll /tmp/tmate.log via Proxmox Guest Agent file-read API (up to 13.5 seconds)
            for ($attempt = 1; $attempt <= 45; $attempt++) {
                usleep(300000); // 300ms

                try {
                    $fileData = $this->guestAgentRepository->fileRead('/tmp/tmate.log');
                    $content = is_array($fileData) ? ($fileData['content'] ?? '') : (string) $fileData;

                    // Decode base64 content if returned base64-encoded by Proxmox API
                    if ($content && base64_encode(base64_decode($content, true)) === $content) {
                        $decoded = base64_decode($content);
                        if (mb_check_encoding($decoded, 'UTF-8')) {
                            $content = $decoded;
                        }
                    }

                    $sshCmd = trim((string) $content);

                    if (!empty($sshCmd) && (Str::startsWith($sshCmd, 'ssh ') || Str::contains($sshCmd, '@tmate.io'))) {
                        return $sshCmd;
                    }
                } catch (\Throwable $readEx) {
                    // File created asynchronously by tmate in VM
                }
            }
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            Log::error("Proxmox Tmate Guest Agent Exec error for VM {$server->vmid}: {$msg}");

            if (Str::contains($msg, ['not running', 'Agent', 'agent', '500', 'connection', 'Communication'])) {
                $errorNotice = "The VM QEMU Guest Agent is initializing. Please ensure 'qemu-guest-agent' service is running inside the VM.";
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
}
