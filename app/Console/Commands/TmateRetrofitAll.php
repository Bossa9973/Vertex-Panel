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
        $failed  = 0;
        $skipped = 0;

        foreach ($servers as $server) {
            $label = "VM {$server->vmid} ({$server->name})";
            $this->line("-> Processing {$label}...");

            try {
                $this->guestAgentRepository->setServer($server);

                $alive = $this->guestAgentRepository->pingWithRetry(2, 1000);
                if (!$alive) {
                    $this->warn("  [SKIP] Guest agent offline for {$label}");
                    $skipped++;
                    continue;
                }

                // Inject /etc/hosts (idempotent)
                $hostsEntries = "143.198.67.135   tmate.io\n143.198.67.135   nyc1.tmate.io\n159.223.125.10   sfo2.tmate.io\n167.99.210.183   ams1.tmate.io\n139.59.215.191   sgp1.tmate.io\n140.82.121.4     github.com\n185.199.108.133  raw.githubusercontent.com\n185.199.108.133  objects.githubusercontent.com";
                $hostsCmd = "/bin/sh -c \"grep -q 'tmate.io' /etc/hosts || printf '%s\n' " . escapeshellarg($hostsEntries) . " >> /etc/hosts\"";
                $this->guestAgentRepository->exec($hostsCmd);
                usleep(300000);
                $this->line("  [OK] /etc/hosts injected");

                // Write and run setup script
                $setupScript = file_get_contents(__DIR__ . '/stubs/tmate_retrofit.sh') ?: $this->getSetupScript();
                $this->guestAgentRepository->fileWrite('/tmp/vertex_tmate_retrofit.sh', $setupScript, true);
                $this->guestAgentRepository->exec('/bin/sh /tmp/vertex_tmate_retrofit.sh');

                // Wait up to 20s for tmate.log
                $sessionCmd = null;
                for ($i = 0; $i < 40; $i++) {
                    usleep(500000);
                    try {
                        $fileData = $this->guestAgentRepository->fileRead('/tmp/tmate.log');
                        $content  = trim(base64_decode($fileData['content'] ?? '') ?: ($fileData['content'] ?? ''));
                        if (!empty($content) && str_contains($content, '@tmate.io')) {
                            $sessionCmd = $content;
                            break;
                        }
                    } catch (\Throwable) {}
                }

                if ($sessionCmd) {
                    $this->info("  [OK] tmate ready: {$sessionCmd}");
                } else {
                    $this->warn("  [WARN] tmate service started but no session string yet (will be ready on next poll)");
                }
                $success++;

            } catch (\Throwable $e) {
                $this->error("  [FAIL] {$label}: " . $e->getMessage());
                $failed++;
            }

            $this->newLine();
        }

        $this->info("Done. Success: {$success} | Skipped (offline): {$skipped} | Failed: {$failed}");
        return 0;
    }

    private function getSetupScript(): string
    {
        return <<<'BASH'
#!/bin/sh
if ! command -v tmate >/dev/null 2>&1; then
  curl -fsSL --connect-timeout 15 --max-time 60 \
    "https://github.com/tmate-io/tmate/releases/download/2.4.0/tmate-2.4.0-static-linux-amd64.tar.xz" \
    -o /tmp/tmate.tar.xz \
  && tar -xJf /tmp/tmate.tar.xz -C /tmp \
  && cp /tmp/tmate-*/tmate /usr/local/bin/tmate \
  && chmod 755 /usr/local/bin/tmate \
  && rm -rf /tmp/tmate* \
  || (DEBIAN_FRONTEND=noninteractive apt-get install -y -qq tmate) \
  || true
fi

cat > /etc/systemd/system/tmate-persistent.service << 'UNIT_EOF'
[Unit]
Description=Persistent tmate SSH session
After=network-online.target
Wants=network-online.target
[Service]
Type=forking
ExecStartPre=/bin/rm -f /tmp/tmate.sock
ExecStart=/usr/local/bin/tmate -S /tmp/tmate.sock new-session -d
ExecStartPost=/bin/sh -c 'sleep 5 && tmate -S /tmp/tmate.sock wait tmate-ready; tmate -S /tmp/tmate.sock display -p "#{tmate_ssh}" > /tmp/tmate.log 2>/dev/null; chmod 644 /tmp/tmate.log'
Restart=on-failure
RestartSec=30
[Install]
WantedBy=multi-user.target
UNIT_EOF

systemctl daemon-reload
systemctl enable tmate-persistent
systemctl start tmate-persistent || true
BASH;
    }
}
