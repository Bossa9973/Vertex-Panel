<?php

namespace Convoy\Console;

use Convoy\Models\ActivityLog;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Database\Console\PruneCommand;
use Convoy\Console\Commands\Server\ResetUsagesCommand;
use Convoy\Console\Commands\Server\UpdateUsagesCommand;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;
use Convoy\Console\Commands\Maintenance\PruneUsersCommand;
use Convoy\Console\Commands\Server\UpdateRateLimitsCommand;
use Convoy\Console\Commands\Maintenance\PruneOrphanedBackupsCommand;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        $schedule->command('queue:prune-batches')->daily();

        if (config('backups.prune_age')) {
            // Every 30 minutes, run the backup pruning command so that any abandoned backups can be deleted.
            $schedule->command(PruneOrphanedBackupsCommand::class)->everyThirtyMinutes();
        }

        if (config('activity.prune_days')) {
            $schedule->command(PruneCommand::class, ['--model' => [ActivityLog::class]])->daily();
        }

        $schedule->command('horizon:snapshot')->everyFiveMinutes();
        $schedule->command(ResetUsagesCommand::class)->daily();
        $schedule->command(PruneUsersCommand::class)->daily();
        $schedule->command(UpdateUsagesCommand::class)->everyFiveMinutes();
        $schedule->command(UpdateRateLimitsCommand::class)->everyTenMinutes();

        // Poll sish admin API to update tunnel_port for any server whose tunnel came up since last run
        $schedule->call(function () {
            \Convoy\Models\Server::whereIn('tunnel_status', ['pending', 'offline'])
                ->whereNotNull('tunnel_token')
                ->each(function ($server) {
                    app(\Convoy\Services\VertexTunnelService::class)
                        ->pollAssignedPort($server);
                });
        })->everyFiveMinutes()->name('poll-tunnel-ports')->withoutOverlapping();
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        //require base_path('routes/console.php');
    }
}
