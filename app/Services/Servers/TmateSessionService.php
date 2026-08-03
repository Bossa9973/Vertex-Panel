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
        $cacheKey = "server_tmate_ssh_{$server->vmid}";

        // 1. Return cached active SSH command if generated within expiration period
        if ($cachedSsh = Cache::get($cacheKey)) {
            return $this->formatResult($cachedSsh, $server);
        }

        // 2. Proxmox QEMU Guest Agent (Direct Command Execution & SSH Command Extraction)
        $sshCmd = $this->attemptProxmoxTmateExec($server, $errorNotice);

        if ($sshCmd) {
            Cache::put($cacheKey, $sshCmd, now()->addHours(3));
            return $this->formatResult($sshCmd, $server);
        }

        // 3. Fallback: Return informative diagnostic notice if agent fails/boots
        $notice = $errorNotice ?: "QEMU Guest Agent is not responding or tmate connection timed out. Please ensure qemu-guest-agent is installed and running inside the VM (sudo systemctl start qemu-guest-agent).";
        return $this->formatResult($notice, $server);
    }

    /**
     * Executes the exact tmate command via Proxmox QEMU Guest Agent and reads /tmp/tmate.log.
     */
    private function attemptProxmoxTmateExec(Server $server, ?string &$errorNotice = null): ?string
    {
        try {
            $this->guestAgentRepository->setServer($server);

            // Robust in-VM command loop with PATH export & automatic tmate check
            $execCmd = "export PATH=\$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin; "
                . "pkill -9 tmate >/dev/null 2>&1 || true; "
                . "rm -f /tmp/tmate.sock /tmp/tmate.log; "
                . "if ! command -v tmate >/dev/null 2>&1; then "
                . "  (DEBIAN_FRONTEND=noninteractive apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get install -y tmate) >/dev/null 2>&1 || true; "
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
            Log::error("Proxmox Tmate Guest Agent Exec error: {$msg}");

            if (Str::contains($msg, ['not running', 'Agent', 'agent', '500', 'connection'])) {
                $errorNotice = "Proxmox QEMU Guest Agent is not reachable on this VM. Please run 'sudo systemctl enable --now qemu-guest-agent' inside your VM terminal.";
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

