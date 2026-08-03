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
        $sshCmd = $this->attemptProxmoxTmateExec($server);

        if ($sshCmd) {
            Cache::put($cacheKey, $sshCmd, now()->addHours(3));
            return $this->formatResult($sshCmd, $server);
        }

        // 3. Fallback: Return informative diagnostic notice if agent fails/boots
        return $this->formatResult("qemu-guest-agent error or tmate not ready yet. Please ensure agent is running.", $server);
    }

    /**
     * Executes the exact tmate command via Proxmox QEMU Guest Agent and reads /tmp/tmate.log.
     */
    private function attemptProxmoxTmateExec(Server $server): ?string
    {
        try {
            $this->guestAgentRepository->setServer($server);

            // Robust command with PATH export & automatic tmate check:
            $execCmd = "export PATH=\$PATH:/usr/local/bin:/usr/bin:/bin; pkill -9 tmate || true; rm -f /tmp/tmate.sock /tmp/tmate.log; (command -v tmate >/dev/null 2>&1 || (apt-get update && apt-get install -y tmate)); tmate -S /tmp/tmate.sock new-session -d && tmate -S /tmp/tmate.sock wait tmate-ready && tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' > /tmp/tmate.log";

            // Execute command via Proxmox QEMU Guest Agent API
            $this->guestAgentRepository->exec($execCmd);

            // Poll /tmp/tmate.log via Proxmox Guest Agent file-read API (up to 7.5 seconds)
            for ($attempt = 1; $attempt <= 25; $attempt++) {
                usleep(300000); // 300ms

                try {
                    $fileData = $this->guestAgentRepository->fileRead('/tmp/tmate.log');
                    $content = is_array($fileData) ? ($fileData['content'] ?? '') : (string) $fileData;

                    // Decode base64 content if returned base64-encoded by Proxmox API
                    if ($content && base64_encode(base64_decode($content, true)) === $content) {
                        $content = base64_decode($content);
                    }

                    $sshCmd = trim((string) $content);

                    if (!empty($sshCmd) && (Str::startsWith($sshCmd, 'ssh ') || Str::contains($sshCmd, '@tmate.io'))) {
                        return $sshCmd;
                    }
                } catch (\Throwable $readEx) {
                    // File created asynchronously by tmate
                }
            }
        } catch (\Throwable $e) {
            Log::error("Proxmox Tmate Guest Agent Exec error: " . $e->getMessage());
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
