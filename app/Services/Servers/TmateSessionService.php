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
     * Spawns an on-demand tmate SSH session inside the VM via Proxmox QEMU Guest Agent or direct SSH fallback.
     */
    public function createSession(Server $server): array
    {
        $cacheKey = "server_tmate_active_{$server->vmid}";

        // 1. Return cached active SSH command if generated within expiration period
        if ($cachedSsh = Cache::get($cacheKey)) {
            if (is_string($cachedSsh) && !empty($cachedSsh)) {
                return $this->formatResult($cachedSsh, $server);
            }
        }

        // 2. Proxmox QEMU Guest Agent — execute tmate installer & session spawner
        $sshCmd = $this->attemptProxmoxTmateExec($server);

        // 3. Direct SSH fallback if guest agent is unreachable
        if (!$sshCmd) {
            $sshCmd = $this->attemptSshTmateExec($server);
        }

        if ($sshCmd) {
            Cache::put($cacheKey, $sshCmd, now()->addHours(2));
            return $this->formatResult($sshCmd, $server);
        }

        // 4. Ensure cloud-init snippet is attached so VM has qemu-guest-agent configured on reboot
        $this->ensureCloudInitSnippetAttached($server);

        // 5. Informative fallback notice
        return [
            'ssh_cmd'     => null,
            'url'         => null,
            'notice'      => "QEMU Guest Agent is not responding inside this VM. Please ensure the VM is running and 'qemu-guest-agent' service is active.",
            'server_vmid' => $server->vmid,
            'server_uuid' => $server->uuid,
            'server_name' => $server->name,
        ];
    }

    /**
     * Executes the exact tmate command via Proxmox QEMU Guest Agent and reads /tmp/tmate.log.
     */
    private function attemptProxmoxTmateExec(Server $server): ?string
    {
        try {
            $this->guestAgentRepository->setServer($server);

            // Ensure agent: 1 is enabled in Proxmox hardware configuration
            try {
                $this->configRepository->setServer($server)->update(['agent' => 1]);
            } catch (\Throwable) {}

            // Pre-check if guest agent is responsive
            if (!$this->guestAgentRepository->ping()) {
                return null;
            }

            // 1. First check if a healthy session is already recorded in /tmp/tmate.log
            try {
                $existingLog = $this->guestAgentRepository->fileRead('/tmp/tmate.log');
                $existingCmd = $this->decodeFileContent($existingLog);
                if (!empty($existingCmd) && (Str::startsWith($existingCmd, 'ssh ') || Str::contains($existingCmd, '@tmate.io'))) {
                    Log::info("Reusing active tmate session from /tmp/tmate.log for VM {$server->vmid}: {$existingCmd}");
                    return $existingCmd;
                }
            } catch (\Throwable) {}

            // 2. Comprehensive launcher & self-healing tmate script:
            $execCmd = "export PATH=\$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin; "
                . "chmod 1777 /tmp 2>/dev/null || true; "
                . "if [ -S /tmp/tmate.sock ]; then "
                . "  SSH_EXISTING=$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' 2>/dev/null || true); "
                . "  if [ -n \"\$SSH_EXISTING\" ] && echo \"\$SSH_EXISTING\" | grep -q 'ssh '; then "
                . "    echo \"\$SSH_EXISTING\" > /tmp/tmate.log; "
                . "    chmod 644 /tmp/tmate.log 2>/dev/null || true; "
                . "    exit 0; "
                . "  fi; "
                . "fi; "
                . "pkill -9 tmate >/dev/null 2>&1 || true; "
                . "rm -f /tmp/tmate.sock /tmp/tmate.log; "
                . "if ! command -v tmate >/dev/null 2>&1; then "
                . "  (curl -fsSL --connect-timeout 5 https://github.com/tmate-io/tmate/releases/download/2.4.0/tmate-2.4.0-static-linux-amd64.tar.xz -o /tmp/tmate.tar.xz 2>/dev/null && tar -xJf /tmp/tmate.tar.xz -C /tmp 2>/dev/null && cp /tmp/tmate-*/tmate /usr/local/bin/tmate 2>/dev/null && chmod 755 /usr/local/bin/tmate && rm -rf /tmp/tmate*) || true; "
                . "  if ! command -v tmate >/dev/null 2>&1; then "
                . "    (DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tmate) 2>/dev/null || true; "
                . "  fi; "
                . "fi; "
                . "tmate -S /tmp/tmate.sock new-session -d >/dev/null 2>&1 || true; "
                . "for i in $(seq 1 40); do "
                . "  tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' > /tmp/tmate.log 2>/dev/null || true; "
                . "  if grep -q '@' /tmp/tmate.log 2>/dev/null; then chmod 644 /tmp/tmate.log 2>/dev/null; exit 0; fi; "
                . "  sleep 0.25; "
                . "done";

            // Execute script via Proxmox QEMU Guest Agent
            $this->guestAgentRepository->exec($execCmd);

            // Poll /tmp/tmate.log for up to 10 seconds (33 × 300 ms)
            for ($attempt = 1; $attempt <= 33; $attempt++) {
                usleep(300000); // 300 ms

                try {
                    $fileData = $this->guestAgentRepository->fileRead('/tmp/tmate.log');
                    $content = $this->decodeFileContent($fileData);

                    if (!empty($content) && (Str::startsWith($content, 'ssh ') || Str::contains($content, '@tmate.io'))) {
                        Log::info("Tmate session established for VM {$server->vmid} on attempt {$attempt}: {$content}");
                        return $content;
                    }
                } catch (\Throwable) {
                    // /tmp/tmate.log not written yet — keep waiting
                }
            }
        } catch (\Throwable $e) {
            Log::error("Proxmox Tmate Guest Agent Exec error for VM {$server->vmid}: " . $e->getMessage());
        }

        return null;
    }

    /**
     * Direct SSH fallback if guest agent is not yet reachable.
     */
    public function attemptSshTmateExec(Server $server): ?string
    {
        try {
            $server->loadMissing('addresses');
            $primaryAddress = $server->addresses->where('is_primary', true)->first()
                ?? $server->addresses->first();

            $ip = $primaryAddress?->address;
            if (empty($ip)) {
                return null;
            }

            $config = collect($this->configRepository->setServer($server)->getConfig());
            $password = $config->where('key', '=', 'cipassword')->first()['value'] ?? null;

            if (empty($password)) {
                return null;
            }

            $ssh = new \phpseclib3\Net\SSH2($ip, 22, 4);
            $ssh->setTimeout(15);

            if (!$ssh->login('root', $password)) {
                return null;
            }

            $cmd = 'export PATH=$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin; '
                . 'chmod 1777 /tmp 2>/dev/null || true; '
                . 'if ! command -v qemu-ga >/dev/null 2>&1; then '
                . '  DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 || true; '
                . '  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq qemu-guest-agent >/dev/null 2>&1 || true; '
                . 'fi; '
                . 'systemctl enable --now qemu-guest-agent >/dev/null 2>&1 || true; '
                . 'if ! command -v tmate >/dev/null 2>&1; then '
                . '  (curl -fsSL --connect-timeout 5 "https://github.com/tmate-io/tmate/releases/download/2.4.0/tmate-2.4.0-static-linux-amd64.tar.xz" -o /tmp/tmate.tar.xz && tar -xJf /tmp/tmate.tar.xz -C /tmp && cp /tmp/tmate-*/tmate /usr/local/bin/tmate && chmod 755 /usr/local/bin/tmate && rm -rf /tmp/tmate*) || true; '
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
                        Log::info("Tmate session spawned via direct SSH for VM {$server->vmid}: {$line}");
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

    /**
     * Cleanly decodes base64 content returned by Proxmox guest agent fileRead API.
     */
    private function decodeFileContent(mixed $fileData): string
    {
        $raw = is_array($fileData) ? ($fileData['content'] ?? '') : (string) $fileData;
        $trimmed = trim((string) $raw);
        if (empty($trimmed)) {
            return '';
        }

        $decoded = base64_decode($trimmed, true);
        if ($decoded !== false && mb_check_encoding($decoded, 'UTF-8')) {
            return trim($decoded);
        }

        return $trimmed;
    }

    private function formatResult(string $sshCmd, Server $server): array
    {
        return [
            'ssh_cmd'     => $sshCmd,
            'url'         => $sshCmd,
            'server_vmid' => $server->vmid,
            'server_uuid' => $server->uuid,
            'server_name' => $server->name,
        ];
    }

    /**
     * Automatically uploads cloud-init snippets to ensure qemu-guest-agent
     * is installed when the VM boots up or is restarted.
     */
    private function ensureCloudInitSnippetAttached(Server $server): void
    {
        try {
            $userFile = "vertex-cloudinit-{$server->vmid}.yaml";
            $metaFile = "vertex-meta-{$server->vmid}.yaml";

            $this->nodeRepository->setNode($server->node);

            $userYaml = $this->cloudinitService->generateCloudInitUserDataConfig($server);
            $this->nodeRepository->uploadSnippet($userFile, $userYaml);

            $metaYaml = $this->cloudinitService->generateCloudInitMetaDataConfig($server);
            $this->nodeRepository->uploadSnippet($metaFile, $metaYaml);

            $this->configRepository->setServer($server)->update([
                'agent' => 1,
                'cicustom' => "meta=local:snippets/{$metaFile},user=local:snippets/{$userFile}",
            ]);

            Log::info("Auto-attached cloud-init snippet for server {$server->id} (VM {$server->vmid}).");
        } catch (\Throwable $e) {
            Log::debug("Could not auto-attach cloud-init snippet for server {$server->id}: {$e->getMessage()}");
        }
    }
}
