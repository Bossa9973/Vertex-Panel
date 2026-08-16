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
     * Centralized logger writing to both Laravel log and dedicated storage/logs/tmate.log.
     */
    public function logTmate(string $level, string $message, array $context = []): void
    {
        $timestamp = now()->toIso8601String();
        $formatted = "[{$timestamp}] [{$level}] {$message}" . (!empty($context) ? ' ' . json_encode($context) : '') . PHP_EOL;

        Log::log(strtolower($level), "[TMATE] " . $message, $context);

        try {
            $logPath = storage_path('logs/tmate.log');
            @file_put_contents($logPath, $formatted, FILE_APPEND | LOCK_EX);
        } catch (\Throwable) {}
    }

    /**
     * Spawns an on-demand tmate SSH session inside the VM via Proxmox QEMU Guest Agent or direct SSH fallback.
     */
    public function createSession(Server $server): array
    {
        $vmid = $server->vmid;
        $this->logTmate('INFO', "=== Incoming Session Request for Server #{$server->id} (VMID {$vmid}, Node {$server->node?->name}) ===");

        // --- Layer 7: Stale Session Cache Invalidation with TCP Reachability Check ---
        $cachedSession = Cache::get("tmate_session_{$vmid}") ?? Cache::get("server_tmate_active_{$vmid}");
        if ($cachedSession && is_string($cachedSession) && !empty($cachedSession)) {
            $parts = explode('@', str_replace('ssh ', '', $cachedSession));
            $host = trim($parts[1] ?? '');
            if (!empty($host)) {
                $errno = 0;
                $errstr = '';
                $fp = @fsockopen($host, 22, $errno, $errstr, 3);
                if (!$fp) {
                    $this->logTmate('WARNING', "Cached session host {$host}:22 is unreachable ($errstr). Invalidating stale cache.", ['vmid' => $vmid]);
                    Cache::forget("tmate_session_{$vmid}");
                    Cache::forget("server_tmate_active_{$vmid}");
                } else {
                    fclose($fp);
                    $this->logTmate('INFO', "Returning validated active cached session for VM {$vmid}: {$cachedSession}");
                    return $this->formatResult($cachedSession, $server);
                }
            }
        }

        // --- Layer 3: Post-Reboot Detection & Cascade Prevention ---
        $repairDispatched = Cache::get("tmate_repair_dispatched_{$vmid}");
        $repairAttempts = (int) Cache::get("tmate_repair_attempts_{$vmid}", 0);

        $this->logTmate('INFO', "Diagnostic State Check for VM {$vmid}", [
            'repair_dispatched' => (bool) $repairDispatched,
            'repair_attempts'   => $repairAttempts,
        ]);

        $this->guestAgentRepository->setServer($server);

        // Ping agent with retry (3 attempts, 2s gap)
        $agentOnline = $this->guestAgentRepository->pingWithRetry(3, 2000, fn($msg) => $this->logTmate('INFO', $msg));

        if ($repairDispatched) {
            if (!$agentOnline) {
                $this->logTmate('INFO', "VM {$vmid} is currently rebooting/initializing guest agent after auto-repair. Postponing session spawn.");
                return [
                    'ssh_cmd'     => null,
                    'url'         => null,
                    'notice'      => 'VM is rebooting and initializing the QEMU guest agent. This takes 30–90 seconds. Please wait...',
                    'server_vmid' => $vmid,
                    'server_uuid' => $server->uuid,
                    'server_name' => $server->name,
                ];
            }

            // Agent ping succeeded — clear the repair dispatched flag
            Cache::forget("tmate_repair_dispatched_{$vmid}");
            $this->logTmate('INFO', "Guest agent came online after repair for VM {$vmid}. Dispatched flag cleared.");
        } else {
            if (!$agentOnline) {
                if ($repairAttempts >= 2) {
                    $this->logTmate('ERROR', "Auto-repair exhausted ({$repairAttempts} attempts) for VM {$vmid}. Halting reboot loop.");
                    return [
                        'ssh_cmd'     => null,
                        'url'         => null,
                        'notice'      => 'Auto-repair failed after 2 attempts. Please ensure your VM image has cloud-init and qemu-guest-agent available, or SSH into the VM manually and run: apt-get install -y qemu-guest-agent && systemctl enable --now qemu-guest-agent',
                        'server_vmid' => $vmid,
                        'server_uuid' => $server->uuid,
                        'server_name' => $server->name,
                    ];
                }

                $this->logTmate('WARNING', "Agent offline for VM {$vmid} (Attempt count: {$repairAttempts}). Moving to direct SSH fallback or Tier 4 repair notice.");
            }
        }

        // --- Tier 2: Proxmox QEMU Guest Agent Session Execution ---
        if ($agentOnline) {
            $this->logTmate('INFO', "Entering Tier 2 (Proxmox QEMU Guest Agent) for VM {$vmid}");
            $sshCmd = $this->attemptProxmoxTmateExec($server);
            if ($sshCmd) {
                $this->clearRepairFlags($vmid);
                Cache::put("tmate_session_{$vmid}", $sshCmd, now()->addHours(2));
                Cache::put("server_tmate_active_{$vmid}", $sshCmd, now()->addHours(2));
                $this->logTmate('INFO', "Tier 2 SUCCESS: Established tmate session for VM {$vmid}: {$sshCmd}");
                return $this->formatResult($sshCmd, $server);
            }
        }

        // --- Tier 3: Direct In-Guest SSH Fallback ---
        $this->logTmate('INFO', "Entering Tier 3 (Direct SSH Fallback) for VM {$vmid}");
        $sshCmd = $this->attemptSshTmateExec($server);
        if ($sshCmd) {
            $this->clearRepairFlags($vmid);
            Cache::put("tmate_session_{$vmid}", $sshCmd, now()->addHours(2));
            Cache::put("server_tmate_active_{$vmid}", $sshCmd, now()->addHours(2));
            $this->logTmate('INFO', "Tier 3 SUCCESS: Established tmate session via direct SSH for VM {$vmid}: {$sshCmd}");
            return $this->formatResult($sshCmd, $server);
        }

        // --- Tier 4: Auto-Repair Verification & Notice ---
        $this->logTmate('INFO', "Entering Tier 4 (Cloud-Init Auto-Repair Preparation) for VM {$vmid}");
        $this->ensureCloudInitSnippetAttached($server);

        $this->logTmate('ERROR', "All tiers exhausted for VM {$vmid}. Returning QEMU Guest Agent required notice.");

        return [
            'ssh_cmd'     => null,
            'url'         => null,
            'notice'      => "QEMU Guest Agent is not responding inside this VM. Please ensure the VM is running and 'qemu-guest-agent' service is active.",
            'server_vmid' => $vmid,
            'server_uuid' => $server->uuid,
            'server_name' => $server->name,
        ];
    }

    /**
     * Executes the exact tmate command via Proxmox QEMU Guest Agent with Layer 5 in-guest diagnostics.
     */
    private function attemptProxmoxTmateExec(Server $server): ?string
    {
        $vmid = $server->vmid;

        try {
            $this->guestAgentRepository->setServer($server);

            // Layer 1: Verify agent config and serial0 device in Proxmox VM hardware configuration
            try {
                $vmConfig = collect($this->configRepository->setServer($server)->getConfig());
                $updates = ['agent' => 'enabled=1,fstrim_cloned_disks=0'];
                if (!$vmConfig->contains('key', 'serial0')) {
                    $updates['serial0'] = 'socket';
                }
                $this->configRepository->setServer($server)->update($updates);
            } catch (\Throwable $cfgEx) {
                $this->logTmate('DEBUG', "Proxmox config validation warning for VM {$vmid}: {$cfgEx->getMessage()}");
            }

            // 1. Check if a healthy session is already recorded in /tmp/tmate.log or /var/tmp/tmate.log
            foreach (['/tmp/tmate.log', '/var/tmp/tmate.log'] as $checkPath) {
                try {
                    $existingLog = $this->guestAgentRepository->fileRead($checkPath);
                    $existingCmd = $this->decodeFileContent($existingLog);
                    if (!empty($existingCmd) && (Str::startsWith($existingCmd, 'ssh ') || Str::contains($existingCmd, '@tmate.io'))) {
                        $this->logTmate('INFO', "Reusing active tmate session from {$checkPath} for VM {$vmid}: {$existingCmd}");
                        return $existingCmd;
                    }
                } catch (\Throwable) {}
            }

            // 2. Layer 5: Comprehensive in-guest runner script with noexec check, network check, and timeout logging:
            $scriptContent = "#!/bin/sh\n"
                . "export PATH=\$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin\n"
                . "TMATE_WORK_DIR=/tmp\n"
                . "echo '#!/bin/sh' > /tmp/_exec_test.sh 2>/dev/null || true\n"
                . "chmod +x /tmp/_exec_test.sh 2>/dev/null || true\n"
                . "if ! /tmp/_exec_test.sh 2>/dev/null; then\n"
                . "  TMATE_WORK_DIR=/var/tmp\n"
                . "fi\n"
                . "rm -f /tmp/_exec_test.sh 2>/dev/null || true\n"
                . "chmod 1777 \$TMATE_WORK_DIR 2>/dev/null || true\n"
                . "\n"
                . "if ! curl -fsSL --connect-timeout 5 --max-time 8 https://tmate.io > /dev/null 2>&1; then\n"
                . "  echo 'TMATE_NETWORK_ERROR: Cannot reach tmate.io' > \${TMATE_WORK_DIR}/tmate.log\n"
                . "  chmod 644 \${TMATE_WORK_DIR}/tmate.log 2>/dev/null || true\n"
                . "  exit 1\n"
                . "fi\n"
                . "\n"
                . "if [ -S \${TMATE_WORK_DIR}/tmate.sock ]; then\n"
                . "  SSH_EXISTING=\$(tmate -S \${TMATE_WORK_DIR}/tmate.sock display -p '#{tmate_ssh}' 2>/dev/null || true)\n"
                . "  if [ -n \"\$SSH_EXISTING\" ] && echo \"\$SSH_EXISTING\" | grep -q 'ssh '; then\n"
                . "    echo \"\$SSH_EXISTING\" > \${TMATE_WORK_DIR}/tmate.log\n"
                . "    chmod 644 \${TMATE_WORK_DIR}/tmate.log 2>/dev/null || true\n"
                . "    exit 0\n"
                . "  fi\n"
                . "fi\n"
                . "\n"
                . "pkill -9 -f \"tmate -S \${TMATE_WORK_DIR}/tmate.sock\" 2>/dev/null || true\n"
                . "pkill -9 tmate 2>/dev/null || true\n"
                . "rm -f \${TMATE_WORK_DIR}/tmate.sock \${TMATE_WORK_DIR}/tmate.log \${TMATE_WORK_DIR}/tmate_err.log\n"
                . "\n"
                . "if ! command -v tmate >/dev/null 2>&1; then\n"
                . "  (curl -fsSL --connect-timeout 5 https://github.com/tmate-io/tmate/releases/download/2.4.0/tmate-2.4.0-static-linux-amd64.tar.xz -o \${TMATE_WORK_DIR}/tmate.tar.xz 2>/dev/null \\\n"
                . "   && tar -xJf \${TMATE_WORK_DIR}/tmate.tar.xz -C \${TMATE_WORK_DIR} 2>/dev/null \\\n"
                . "   && cp \${TMATE_WORK_DIR}/tmate-*/tmate /usr/local/bin/tmate 2>/dev/null \\\n"
                . "   && chmod 755 /usr/local/bin/tmate 2>/dev/null \\\n"
                . "   && rm -rf \${TMATE_WORK_DIR}/tmate*) || true\n"
                . "  if ! command -v tmate >/dev/null 2>&1; then\n"
                . "    (DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tmate) 2>/dev/null || true\n"
                . "  fi\n"
                . "fi\n"
                . "\n"
                . "tmate -S \${TMATE_WORK_DIR}/tmate.sock set-option -g destroy-unattached off 2>/dev/null || true\n"
                . "tmate -S \${TMATE_WORK_DIR}/tmate.sock set-option -g remain-on-exit on 2>/dev/null || true\n"
                . "tmate -S \${TMATE_WORK_DIR}/tmate.sock set-option -g tmate-keepalive 10 2>/dev/null || true\n"
                . "tmate -S \${TMATE_WORK_DIR}/tmate.sock new-session -d 'bash -l' 2>\${TMATE_WORK_DIR}/tmate_err.log || tmate -S \${TMATE_WORK_DIR}/tmate.sock new-session -d 2>>\${TMATE_WORK_DIR}/tmate_err.log || true\n"
                . "\n"
                . "for i in \$(seq 1 40); do\n"
                . "  tmate -S \${TMATE_WORK_DIR}/tmate.sock wait tmate-ready 2>/dev/null || true\n"
                . "  SSH_STR=\$(tmate -S \${TMATE_WORK_DIR}/tmate.sock display -p '#{tmate_ssh}' 2>/dev/null || true)\n"
                . "  if [ -n \"\$SSH_STR\" ] && echo \"\$SSH_STR\" | grep -q 'ssh '; then\n"
                . "    echo \"\$SSH_STR\" > \${TMATE_WORK_DIR}/tmate.log\n"
                . "    chmod 644 \${TMATE_WORK_DIR}/tmate.log 2>/dev/null || true\n"
                . "    exit 0\n"
                . "  fi\n"
                . "  sleep 0.25\n"
                . "done\n"
                . "\n"
                . "echo 'TMATE_TIMEOUT: tmate started but did not produce SSH string after 10s. Check: tmate connectivity, /tmp exec permissions, tmate binary integrity.' > \${TMATE_WORK_DIR}/tmate.log\n"
                . "chmod 644 \${TMATE_WORK_DIR}/tmate.log 2>/dev/null || true\n";

            // Write script into VM filesystem
            try {
                $this->guestAgentRepository->fileWrite('/tmp/vertex_tmate.sh', $scriptContent, true);
                $this->guestAgentRepository->fileWrite('/var/tmp/vertex_tmate.sh', $scriptContent, true);
            } catch (\Throwable $fwEx) {
                $this->logTmate('DEBUG', "fileWrite warning for VM {$vmid}: {$fwEx->getMessage()}");
            }

            $this->logTmate('INFO', "Dispatching in-VM runner via guest agent for VM {$vmid}");
            $execResponse = $this->guestAgentRepository->exec('/bin/sh /tmp/vertex_tmate.sh');
            $pid = is_array($execResponse) ? ($execResponse['pid'] ?? 'N/A') : 'N/A';
            $this->logTmate('INFO', "Guest agent exec dispatched for VM {$vmid} (PID: {$pid})");

            // Poll log files for up to 12 seconds (40 × 300 ms)
            for ($attempt = 1; $attempt <= 40; $attempt++) {
                usleep(300000); // 300 ms

                foreach (['/tmp/tmate.log', '/var/tmp/tmate.log'] as $pollPath) {
                    try {
                        $fileData = $this->guestAgentRepository->fileRead($pollPath);
                        $content = $this->decodeFileContent($fileData);

                        if (!empty($content)) {
                            if (Str::startsWith($content, 'ssh ') || Str::contains($content, '@tmate.io')) {
                                $this->logTmate('INFO', "Tmate session established for VM {$vmid} on attempt {$attempt} from {$pollPath}: {$content}");
                                return $content;
                            }

                            if (Str::contains($content, 'TMATE_NETWORK_ERROR')) {
                                $this->logTmate('ERROR', "In-guest network error for VM {$vmid}: {$content}");
                                return null;
                            }

                            if (Str::contains($content, 'TMATE_TIMEOUT')) {
                                $this->logTmate('WARNING', "In-guest timeout for VM {$vmid}: {$content}");
                                return null;
                            }
                        }
                    } catch (\Throwable) {
                        // File not written yet — keep polling
                    }
                }
            }

            // Check stderr if not ready
            foreach (['/tmp/tmate_err.log', '/var/tmp/tmate_err.log'] as $errPath) {
                try {
                    $errLog = $this->guestAgentRepository->fileRead($errPath);
                    $errContent = $this->decodeFileContent($errLog);
                    if (!empty($errContent)) {
                        $this->logTmate('WARNING', "tmate stderr log from {$errPath} for VM {$vmid}: {$errContent}");
                    }
                } catch (\Throwable) {}
            }

        } catch (\Throwable $e) {
            $this->logTmate('ERROR', "Proxmox Tmate Guest Agent Exec exception for VM {$vmid}: " . $e->getMessage());
        }

        return null;
    }

    /**
     * Direct SSH fallback if guest agent is not yet reachable.
     */
    public function attemptSshTmateExec(Server $server): ?string
    {
        $vmid = $server->vmid;

        try {
            $server->loadMissing('addresses');
            $primaryAddress = $server->addresses->where('is_primary', true)->first()
                ?? $server->addresses->first();

            $ip = $primaryAddress?->address;
            if (empty($ip)) {
                $this->logTmate('WARNING', "Direct SSH fallback skipped: no primary IP address for VM {$vmid}");
                return null;
            }

            $config = collect($this->configRepository->setServer($server)->getConfig());
            $password = $config->where('key', '=', 'cipassword')->first()['value'] ?? null;

            if (empty($password)) {
                $this->logTmate('WARNING', "Direct SSH fallback skipped: cipassword not found for VM {$vmid}");
                return null;
            }

            $this->logTmate('INFO', "Attempting direct SSH connection to {$ip}:22 for VM {$vmid}...");
            $ssh = new \phpseclib3\Net\SSH2($ip, 22, 4);
            $ssh->setTimeout(15);

            $ciUser = $config->where('key', '=', 'ciuser')->first()['value'] ?? null;
            $usernames = array_unique(array_filter([$ciUser, 'root', 'ubuntu', 'debian', 'centos', 'cloud-user', 'admin']));
            $loggedIn = false;
            $activeUser = 'root';

            foreach ($usernames as $user) {
                try {
                    if ($ssh->login($user, $password)) {
                        $loggedIn = true;
                        $activeUser = $user;
                        $this->logTmate('INFO', "Direct SSH login SUCCESS as '{$activeUser}' on {$ip} for VM {$vmid}");
                        break;
                    }
                } catch (\Throwable) {}
            }

            if (!$loggedIn) {
                $this->logTmate('WARNING', "Direct SSH login failed across usernames [" . implode(', ', $usernames) . "] on {$ip} for VM {$vmid}");
                return null;
            }

            $sudoPrefix = ($activeUser !== 'root') ? "echo '{$password}' | sudo -S " : '';

            $cmd = 'export PATH=$PATH:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin; '
                . 'chmod 1777 /tmp 2>/dev/null || true; '
                . 'if ! command -v qemu-ga >/dev/null 2>&1; then '
                . '  (' . $sudoPrefix . 'DEBIAN_FRONTEND=noninteractive apt-get update -qq && ' . $sudoPrefix . 'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq qemu-guest-agent) >/dev/null 2>&1 || true; '
                . 'fi; '
                . $sudoPrefix . 'systemctl enable --now qemu-guest-agent >/dev/null 2>&1 || true; '
                . 'if ! command -v tmate >/dev/null 2>&1; then '
                . '  (curl -fsSL --connect-timeout 5 "https://github.com/tmate-io/tmate/releases/download/2.4.0/tmate-2.4.0-static-linux-amd64.tar.xz" -o /tmp/tmate.tar.xz && tar -xJf /tmp/tmate.tar.xz -C /tmp && ' . $sudoPrefix . 'cp /tmp/tmate-*/tmate /usr/local/bin/tmate && ' . $sudoPrefix . 'chmod 755 /usr/local/bin/tmate && rm -rf /tmp/tmate*) || true; '
                . 'fi; '
                . 'pkill -9 -f tmate >/dev/null 2>&1 || true; '
                . 'rm -f /tmp/tmate.sock /tmp/tmate.log; '
                . 'tmate -S /tmp/tmate.sock set-option -g destroy-unattached off 2>/dev/null || true; '
                . 'tmate -S /tmp/tmate.sock set-option -g remain-on-exit on 2>/dev/null || true; '
                . 'tmate -S /tmp/tmate.sock set-option -g tmate-keepalive 10 2>/dev/null || true; '
                . 'tmate -S /tmp/tmate.sock new-session -d "bash -l" 2>/dev/null || tmate -S /tmp/tmate.sock new-session -d 2>/dev/null || true; '
                . 'for i in $(seq 1 40); do '
                . '  tmate -S /tmp/tmate.sock wait tmate-ready 2>/dev/null || true; '
                . '  SSH_STR=$(tmate -S /tmp/tmate.sock display -p "#{tmate_ssh}" 2>/dev/null || true); '
                . '  if [ -n "$SSH_STR" ] && echo "$SSH_STR" | grep -q "ssh "; then '
                . '    echo "$SSH_STR" > /tmp/tmate.log; '
                . '    chmod 644 /tmp/tmate.log 2>/dev/null || true; '
                . '    echo "$SSH_STR"; '
                . '    exit 0; '
                . '  fi; '
                . '  sleep 0.25; '
                . 'done';

            $output = trim((string) $ssh->exec($cmd));

            if (!empty($output)) {
                $lines = explode("\n", $output);
                foreach ($lines as $line) {
                    $line = trim($line);
                    if (Str::startsWith($line, 'ssh ') || Str::contains($line, '@tmate.io')) {
                        $this->logTmate('INFO', "Tmate session spawned via direct SSH for VM {$vmid}: {$line}");
                        try {
                            $this->configRepository->setServer($server)->update(['agent' => 'enabled=1,fstrim_cloned_disks=0']);
                        } catch (\Throwable) {}
                        return $line;
                    }
                }
            }
        } catch (\Throwable $e) {
            $this->logTmate('WARNING', "attemptSshTmateExec fallback failed for VM {$vmid}: {$e->getMessage()}");
        }

        return null;
    }

    /**
     * Clears repair dispatched and attempts flags when a session is successfully established.
     */
    private function clearRepairFlags(int $vmid): void
    {
        Cache::forget("tmate_repair_dispatched_{$vmid}");
        Cache::forget("tmate_repair_attempts_{$vmid}");
        $this->logTmate('INFO', "Cleared repair flags for VM {$vmid}");
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

    public function formatResult(string $sshCmd, Server $server): array
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
    public function ensureCloudInitSnippetAttached(Server $server): void
    {
        $vmid = $server->vmid;

        try {
            $userFile = "vertex-cloudinit-{$vmid}.yaml";
            $metaFile = "vertex-meta-{$vmid}.yaml";

            $this->nodeRepository->setNode($server->node);

            $userYaml = $this->cloudinitService->generateCloudInitUserDataConfig($server);
            $this->nodeRepository->uploadSnippet($userFile, $userYaml);

            $metaYaml = $this->cloudinitService->generateCloudInitMetaDataConfig($server);
            $this->nodeRepository->uploadSnippet($metaFile, $metaYaml);

            $this->configRepository->setServer($server)->update([
                'agent'    => 'enabled=1,fstrim_cloned_disks=0',
                'cicustom' => "meta=local:snippets/{$metaFile},user=local:snippets/{$userFile}",
            ]);

            $this->logTmate('INFO', "Auto-attached cloud-init snippet for server {$server->id} (VM {$vmid}).");
        } catch (\Throwable $e) {
            $this->logTmate('DEBUG', "Could not auto-attach cloud-init snippet for server {$server->id}: {$e->getMessage()}");
        }
    }
}
