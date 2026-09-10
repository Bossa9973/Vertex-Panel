<?php

namespace Convoy\Console\Commands\Server;

use Convoy\Models\Server;
use Convoy\Enums\Server\Status;
use Convoy\Enums\Server\SuspensionAction;
use Convoy\Services\Servers\ServerSuspensionService;
use Convoy\Services\Servers\ServerDeletionService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;
use Throwable;

class CheckFreeServerActivityCommand extends Command
{
    protected $signature = 'server:check-free-activity
                            {--dry-run : Preview actions without modifying or deleting servers}
                            {--server= : Check a specific server ID}';

    protected $description = 'Scan free VPS instances: suspend those past 72h + 30m, and permanently delete those past 48h suspended.';

    public function __construct(
        private ServerSuspensionService $suspensionService,
        private ServerDeletionService $deletionService
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $dryRun   = (bool) $this->option('dry-run');
        $serverId = $this->option('server');

        $this->info('Starting free server activity check scan' . ($dryRun ? ' (DRY RUN)' : '') . '...');

        $now = Carbon::now();

        // ─────────────────────────────────────────────────────────────
        // 1. AUTO-SUSPENSION: Active servers past 72h + 30m grace
        // ─────────────────────────────────────────────────────────────
        $suspendQuery = Server::where(function ($q) {
            $q->where('plan_tier', '!=', 'paid')->orWhereNull('plan_tier');
        })
            ->whereNull('status')
            ->whereNotNull('activity_expires_at')
            ->where('activity_expires_at', '<=', $now->copy()->subMinutes(30));

        if ($serverId) {
            $suspendQuery->where('id', $serverId);
        }

        $toSuspend = $suspendQuery->get();
        $this->line("Found {$toSuspend->count()} free server(s) eligible for suspension (72h + 30m grace expired).");

        foreach ($toSuspend as $server) {
            $this->warn("-> Suspending free server #{$server->id} ('{$server->name}') [VMID: {$server->vmid}]...");

            if ($dryRun) {
                $this->line("   [DRY RUN] Would suspend server #{$server->id} and set 48h deletion deadline.");
                continue;
            }

            try {
                // Kill VM and update status to suspended
                $this->suspensionService->toggle($server, SuspensionAction::SUSPEND);

                $server->update([
                    'suspended_at'                 => Carbon::now(),
                    'deletion_deadline_at'         => Carbon::now()->addDays(2),
                    'reactivation_codes_completed' => 0,
                ]);

                try {
                    \Convoy\Facades\Activity::event('server:activity-suspended')
                        ->actor($server->user)
                        ->subject($server)
                        ->description("Free VPS '{$server->name}' automatically suspended due to inactivity (72h + 30m elapsed). 48 hours remaining to claim back via 3 links.")
                        ->property([
                            'server_id'            => $server->id,
                            'activity_expires_at'  => (string) $server->activity_expires_at,
                            'deletion_deadline_at' => (string) $server->deletion_deadline_at,
                        ])
                        ->log();
                } catch (Throwable $e) {}

                Log::info("Free server #{$server->id} auto-suspended due to inactivity", [
                    'server_id'            => $server->id,
                    'vmid'                 => $server->vmid,
                    'user_id'              => $server->user_id,
                    'deletion_deadline_at' => $server->deletion_deadline_at,
                ]);
            } catch (Throwable $e) {
                $this->error("   Failed to suspend server #{$server->id}: " . $e->getMessage());
                Log::error("Failed to auto-suspend free server #{$server->id}: " . $e->getMessage());
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 2. PERMANENT DELETION ("IT'S GG"): Suspended servers past 48h
        // ─────────────────────────────────────────────────────────────
        $deleteQuery = Server::where(function ($q) {
            $q->where('plan_tier', '!=', 'paid')->orWhereNull('plan_tier');
        })
            ->where('status', Status::SUSPENDED->value)
            ->whereNotNull('deletion_deadline_at')
            ->where('deletion_deadline_at', '<=', $now);

        if ($serverId) {
            $deleteQuery->where('id', $serverId);
        }

        $toDelete = $deleteQuery->get();
        $this->line("Found {$toDelete->count()} suspended free server(s) eligible for permanent deletion (48h recovery window expired).");

        foreach ($toDelete as $server) {
            $this->error("-> PERMANENTLY DELETING server #{$server->id} ('{$server->name}') [VMID: {$server->vmid}] - It's GG!");

            if ($dryRun) {
                $this->line("   [DRY RUN] Would permanently wipe VM #{$server->id} from Proxmox and database.");
                continue;
            }

            try {
                try {
                    \Convoy\Facades\Activity::event('server:activity-purged')
                        ->actor($server->user)
                        ->subject($server)
                        ->description("Free VPS '{$server->name}' permanently deleted after 48h suspended recovery window expired without completing 3/3 claim links.")
                        ->property([
                            'server_id'            => $server->id,
                            'vmid'                 => $server->vmid,
                            'deletion_deadline_at' => (string) $server->deletion_deadline_at,
                        ])
                        ->log();
                } catch (Throwable $e) {}

                // Execute full deletion chain (Proxmox destroy + disk purge + IP release + DB cleanup)
                $this->deletionService->handle($server);

                Log::info("Free server #{$server->id} permanently deleted following 48h recovery expiration", [
                    'server_id' => $server->id,
                    'vmid'      => $server->vmid,
                    'user_id'   => $server->user_id,
                ]);
            } catch (Throwable $e) {
                $this->error("   Failed to permanently delete server #{$server->id}: " . $e->getMessage());
                Log::error("Failed to permanently delete free server #{$server->id}: " . $e->getMessage());
            }
        }

        $this->info('Free server activity check scan completed.');

        return Command::SUCCESS;
    }
}
