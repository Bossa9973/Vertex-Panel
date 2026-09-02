<?php

namespace Convoy\Console\Commands\Server;

use Convoy\Jobs\Server\UploadBackupToCloudJob;
use Convoy\Models\Backup;
use Convoy\Models\Node;
use Convoy\Services\Backups\BackupUploadDiagnosticService;
use Illuminate\Console\Command;
use Throwable;

/**
 * Upload pending or un-uploaded backups directly to Google Drive with advanced error diagnostics.
 *
 * Usage:
 *   php artisan server:upload-pending-backups --sync
 *   php artisan p:server:upload-pending-backups --sync
 *   php artisan server:upload-pending-backups --backup=62 --sync
 *   php artisan server:upload-pending-backups --server=42 --sync
 *   php artisan server:upload-pending-backups --diagnose
 */
class UploadPendingBackupsCommand extends Command
{
    protected $signature = 'server:upload-pending-backups
                            {--server= : Only process backups for a specific server ID}
                            {--backup= : Only process a specific backup ID}
                            {--node= : Only process backups for servers on a specific node ID}
                            {--sync : Execute upload synchronously in this terminal with live output}
                            {--force : Retry backups even if previously marked failed or uploaded}
                            {--diagnose : Perform connection and credentials diagnostics without uploading}
                            {--limit= : Limit the number of backups to process}';

    protected $aliases = ['p:server:upload-pending-backups'];

    protected $description = 'Dispatch or immediately stream un-uploaded VM backups to Google Drive with error diagnostics.';

    public function __construct(private BackupUploadDiagnosticService $diagnosticService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $serverId = $this->option('server');
        $backupId = $this->option('backup');
        $nodeId   = $this->option('node');
        $sync     = $this->option('sync');
        $force    = $this->option('force');
        $diagnose = $this->option('diagnose');
        $limit    = $this->option('limit') ? (int) $this->option('limit') : null;

        $this->line('');
        $this->line('<fg=cyan;options=bold>================================================================================</>');
        $this->line('<fg=cyan;options=bold>  Convoy / Vertex Backup Cloud Streaming & Verification Engine  </>');
        $this->line('<fg=cyan;options=bold>================================================================================</>');
        $this->line('');

        // Diagnostic-only mode
        if ($diagnose) {
            return $this->runDiagnostics($nodeId);
        }

        $query = Backup::with('server.node')
            ->where('is_successful', true)
            ->whereNotNull('file_name');

        if ($backupId) {
            $query->where('id', (int) $backupId);
        }

        if ($serverId) {
            $query->where('server_id', (int) $serverId);
        }

        if ($nodeId) {
            $query->whereHas('server', function ($q) use ($nodeId) {
                $q->where('node_id', (int) $nodeId);
            });
        }

        if (!$force) {
            $query->where(function ($q) {
                $q->whereNull('cloud_status')
                  ->orWhereIn('cloud_status', ['pending', 'uploading', 'failed']);
            });
        }

        if ($limit) {
            $query->limit($limit);
        }

        $backups = $query->orderBy('id', 'desc')->get();

        $this->info("Found {$backups->count()} backup(s) eligible for cloud upload.");

        if ($backups->isEmpty()) {
            $this->line("No pending backups found to upload. Pass <comment>--force</comment> to re-upload previously processed backups.");
            $this->line('');
            return self::SUCCESS;
        }

        $succeeded = 0;
        $failed    = 0;
        $total     = $backups->count();
        $index     = 0;

        foreach ($backups as $backup) {
            $index++;
            $server = $backup->server;
            $node   = $server?->node;

            $sshHost     = $node ? (!empty($node->ssh_host) ? $node->ssh_host : $node->fqdn) : 'N/A';
            $sshPort     = $node ? ($node->ssh_port ?: 22) : 22;
            $sshUsername = $node ? (!empty($node->ssh_username) ? $node->ssh_username : 'root') : 'root';
            $remotePath  = $node ? (rtrim($node->getBackupBasePath(), '/') . '/' . $backup->file_name) : 'N/A';

            $this->line('');
            $this->line(sprintf(
                '<fg=yellow;options=bold>[%d/%d]</> <options=bold>Processing Backup #%d</> for Server #%d (<fg=cyan>%s</>)',
                $index,
                $total,
                $backup->id,
                $backup->server_id,
                $server?->hostname ?? 'unknown'
            ));
            $this->line("   <fg=gray>• Archive File:</> {$backup->file_name}");
            $this->line("   <fg=gray>• Target Node :</> Node #{$node?->id} ({$node?->name}) -> {$sshUsername}@{$sshHost}:{$sshPort}");
            $this->line("   <fg=gray>• Remote Path :</> {$remotePath}");

            if (!$node) {
                $this->error("   ❌ [ERROR] Server #{$backup->server_id} has no assigned Proxmox node in database.");
                $failed++;
                continue;
            }

            if ($sync) {
                try {
                    $this->line("   <fg=blue>[STREAMING]</> Connecting via SFTP and streaming to Google Drive synchronously...");
                    UploadBackupToCloudJob::dispatchSync($backup->id);

                    // Refresh backup to read cloud_path
                    $backup->refresh();
                    $this->info("   ✅ [OK] Successfully uploaded Backup #{$backup->id} to Google Drive!");
                    if ($backup->cloud_path) {
                        $this->line("   <fg=green>   Destination: {$backup->cloud_path}</>");
                    }
                    $succeeded++;
                } catch (Throwable $e) {
                    $failed++;
                    $this->error("   ❌ [FAILED] Upload failed: " . $e->getMessage());

                    // Run comprehensive diagnostic analysis
                    $diag = $this->diagnosticService->diagnoseFailure($e, $backup, $node);
                    $this->renderDiagnosticReport($diag);
                }
            } else {
                UploadBackupToCloudJob::dispatch($backup->id);
                $this->info("   🚀 [DISPATCHED] Dispatched to background queue for Backup #{$backup->id}.");
                $succeeded++;
            }
        }

        $this->line('');
        $this->line('<fg=cyan;options=bold>--------------------------------------------------------------------------------</>');
        $this->line(sprintf(
            '<options=bold>Upload Summary:</> Total Processed: <fg=cyan>%d</> | Succeeded: <fg=green>%d</> | Failed: <fg=red>%d</>',
            $total,
            $succeeded,
            $failed
        ));
        $this->line('<fg=cyan;options=bold>================================================================================</>');
        $this->line('');

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * Renders a styled diagnostic report in the terminal.
     */
    private function renderDiagnosticReport(array $diag): void
    {
        $this->line('');
        $this->line('   <fg=red;options=bold>┌─────────────────────────────────────────────────────────────────────────────┐</>');
        $this->line('   <fg=red;options=bold>│ 🔍 DIAGNOSTIC ANALYSIS & ROOT CAUSE                                         │</>');
        $this->line('   <fg=red;options=bold>├─────────────────────────────────────────────────────────────────────────────┤</>');

        $this->line(sprintf('   <fg=red;options=bold>│</> <fg=yellow;options=bold>Category:</>  %-62s <fg=red;options=bold>│</>', substr($diag['category'], 0, 62)));
        $this->line(sprintf('   <fg=red;options=bold>│</> <fg=yellow;options=bold>Title:   </>  %-62s <fg=red;options=bold>│</>', substr($diag['title'], 0, 62)));
        $this->line(sprintf('   <fg=red;options=bold>│</> <fg=yellow;options=bold>Target:  </>  %-62s <fg=red;options=bold>│</>', substr($diag['target'], 0, 62)));

        if (!empty($diag['what_happened'])) {
            $this->line('   <fg=red;options=bold>│</>                                                                             <fg=red;options=bold>│</>');
            $this->line('   <fg=red;options=bold>│</> <fg=white;options=bold>🧐 What went wrong:</>                                                   <fg=red;options=bold>│</>');
            foreach ($diag['what_happened'] as $item) {
                $wrapped = wordwrap("• " . $item, 70, "\n", true);
                foreach (explode("\n", $wrapped) as $line) {
                    $this->line(sprintf('   <fg=red;options=bold>│</>   %-72s <fg=red;options=bold>│</>', $line));
                }
            }
        }

        if (!empty($diag['recommendations'])) {
            $this->line('   <fg=red;options=bold>│</>                                                                             <fg=red;options=bold>│</>');
            $this->line('   <fg=red;options=bold>│</> <fg=green;options=bold>🛠️ Actionable Steps to Fix:</>                                           <fg=red;options=bold>│</>');
            foreach ($diag['recommendations'] as $idx => $item) {
                $wrapped = wordwrap(sprintf("%d. %s", $idx + 1, $item), 70, "\n", true);
                foreach (explode("\n", $wrapped) as $line) {
                    $this->line(sprintf('   <fg=red;options=bold>│</>   <fg=green>%-72s</> <fg=red;options=bold>│</>', $line));
                }
            }
        }

        $this->line('   <fg=red;options=bold>└─────────────────────────────────────────────────────────────────────────────┘</>');
        $this->line('');
    }

    /**
     * Run diagnostics on configured nodes without uploading.
     */
    private function runDiagnostics(?string $nodeId = null): int
    {
        $query = Node::query();
        if ($nodeId) {
            $query->where('id', (int) $nodeId);
        }
        $nodes = $query->get();

        if ($nodes->isEmpty()) {
            $this->warn("No nodes found to diagnose.");
            return self::SUCCESS;
        }

        $this->info("Running SSH & Network Diagnostics on {$nodes->count()} Node(s)...");
        $this->line('');

        foreach ($nodes as $node) {
            $report = $this->diagnosticService->diagnoseNode($node);

            $this->line(sprintf(
                '<options=bold>Node #%d (%s)</> -> Target: <fg=cyan>%s:%d</> (User: %s)',
                $node->id,
                $node->name,
                $report['ssh_host'] ?: '<missing>',
                $report['ssh_port'],
                $report['ssh_username']
            ));

            if ($report['resolved_ip'] && $report['resolved_ip'] !== $report['ssh_host']) {
                $this->line("   • DNS Resolved IP : {$report['resolved_ip']}" . ($report['is_cloudflare'] ? " <fg=red>[Cloudflare Proxy Detected!]</>" : ""));
            }

            // Private Key
            if ($report['key_status'] === 'valid') {
                $this->line("   • SSH Private Key : <fg=green>✓ Valid & Parsable</>");
            } elseif ($report['key_status'] === 'missing') {
                $this->line("   • SSH Private Key : <fg=red>✗ Missing (Not Configured)</>");
            } else {
                $this->line("   • SSH Private Key : <fg=red>✗ Invalid: {$report['key_error']}</>");
            }

            // Socket / Banner
            if ($report['socket_status'] === 'connected') {
                $serviceColor = $report['detected_service'] === 'ssh' ? 'green' : 'red';
                $this->line("   • TCP Socket      : <fg=green>✓ Connected</>");
                $this->line(sprintf("   • Service Detected: <fg=%s>%s</>", $serviceColor, strtoupper($report['detected_service'])));
                if ($report['banner']) {
                    $this->line("   • Banner Received : \"<fg=yellow>{$report['banner']}</>\"");
                }
            } else {
                $this->line("   • TCP Socket      : <fg=red>✗ {$report['socket_error']}</>");
            }

            if (!empty($report['probable_cause'])) {
                $this->line("   <fg=yellow;options=bold>• Issue Analysis  :</> {$report['probable_cause']}");
            }

            if (!empty($report['recommendations'])) {
                $this->line("   <fg=cyan;options=bold>• Recommendations :</>");
                foreach ($report['recommendations'] as $rec) {
                    $this->line("     - <fg=green>{$rec}</>");
                }
            }

            $this->line('--------------------------------------------------------------------------------');
        }

        return self::SUCCESS;
    }
}
