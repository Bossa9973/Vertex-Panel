<?php

namespace Convoy\Console\Commands;

use Illuminate\Console\Command;
use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\Server\ProxmoxGuestAgentRepository;

class TmateRetrofitAll extends Command
{
    protected $signature = 'tmate:retrofit-all {--vmid= : Only retrofit a specific VMID}';
    protected $description = 'Push tmate setup to all running VMs via QEMU Guest Agent';

    public function __construct(
        private ProxmoxGuestAgentRepository $guestAgentRepository,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $query = Server::with(['node', 'addresses']);
        if ($vmid = $this->option('vmid')) {
            $query->where('vmid', $vmid);
        }
        $servers = $query->get();
        if ($servers->isEmpty()) {
            $this->error('No servers found.');
            return 1;
        }
        $this->info("Found {$servers->count()} server(s). Starting tmate retrofit...");
        $this->newLine();
        $success = 0;
        $failed = 0;
        foreach ($servers as $server) {
            $label = "VM {$server->vmid} ({$server->name})";
            $this->line("Processing {$label}...");
            try {
                $this->guestAgentRepository->setServer($server);

                // Step 1: Inject /etc/hosts static DNS (idempotent)
                $hostsCmd = "grep -q 'tmate.io' /etc/hosts || printf '143.198.67.135 tmate.io\n143.198.67.135 nyc1.tmate.io\n159.223.125.10 sfo2.tmate.io\n167.99.210.183 ams1.tmate.io\n139.59.215.191 sgp1.tmate.io\n140.82.121.4 github.com\n185.199.108.133 raw.githubusercontent.com\n' >> /etc/hosts";
                $this->guestAgentRepository->exec($hostsCmd);
                usleep(500000);
                $this->line("  [OK] /etc/hosts injected");

                // Step 2: Install tmate from internal Proxmox host mirror
                $installCmd = "if ! command -v tmate >/dev/null 2>&1; then curl -fsSL --connect-timeout 10 --max-time 60 'http://10.0.0.1:9999/tmate-static' -o /usr/local/bin/tmate && chmod 755 /usr/local/bin/tmate || true; fi";
                $this->guestAgentRepository->exec($installCmd);
                usleep(5000000);
                $this->line("  [OK] tmate binary install dispatched");

                // Step 3: Write systemd service unit via base64
                $serviceContent = base64_encode("[Unit]\nDescription=Persistent tmate SSH session\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=forking\nExecStartPre=/bin/rm -f /tmp/tmate.sock\nExecStart=/usr/local/bin/tmate -S /tmp/tmate.sock new-session -d\nExecStartPost=/bin/sh -c 'sleep 5 && tmate -S /tmp/tmate.sock wait tmate-ready; tmate -S /tmp/tmate.sock display -p \"#{tmate_ssh}\" > /tmp/tmate.log 2>/dev/null; chmod 644 /tmp/tmate.log'\nRestart=on-failure\nRestartSec=30\n\n[Install]\nWantedBy=multi-user.target\n");
                $this->guestAgentRepository->exec("echo {$serviceContent} | base64 -d > /etc/systemd/system/tmate-persistent.service");
                usleep(500000);
                $this->guestAgentRepository->exec('systemctl daemon-reload && systemctl enable tmate-persistent && systemctl restart tmate-persistent');
                $this->line("  [OK] systemd service installed and started");

                // Step 4: Poll for session string (up to 2 minutes)
                $sessionCmd = null;
                for ($i = 0; $i < 24; $i++) {
                    usleep(5000000);
                    try {
                        $fileData = $this->guestAgentRepository->fileRead('/tmp/tmate.log');
                        $content = trim(base64_decode($fileData['content'] ?? '') ?: ($fileData['content'] ?? ''));
                        if (!empty($content) && str_contains($content, '@tmate.io')) {
                            $sessionCmd = $content;
                            break;
                        }
                    } catch (\Throwable) {}
                }
                if ($sessionCmd) {
                    $this->info("  [OK] tmate ready: {$sessionCmd}");
                } else {
                    $this->warn("  [WARN] No session string yet");
                }
                $success++;

            } catch (\Throwable $e) {
                $msg = $e->getMessage();

                // Guest agent not running — reboot so cloud-init installs tmate on next boot
                if (str_contains($msg, 'QEMU guest agent is not running')) {
                    try {
                        $this->guestAgentRepository->getHttpClient()
                            ->withUrlParameters([
                                'node'   => $server->node->cluster,
                                'server' => $server->vmid,
                            ])
                            ->post('/api2/json/nodes/{node}/qemu/{server}/status/reboot')
                            ->json();
                        $this->warn("  [REBOOT] VM will install tmate on next boot via cloud-init");
                    } catch (\Throwable) {
                        $this->warn("  [REBOOT] Reboot request sent (or already rebooting)");
                    }
                    $success++;

                // VM doesn't exist on Proxmox — silently skip, don't count either way
                } elseif (str_contains($msg, 'does not exist')) {
                    $this->line("  [SKIP] VM not found on Proxmox");

                // Any other error — mark as failed
                } else {
                    $this->error("  [FAIL] {$label}: {$msg}");
                    $failed++;
                }
            }
            $this->newLine();
        }
        $this->info("Done. Success: {$success} | Failed: {$failed}");
        return 0;
    }
}
