<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Adds composite and single-column indexes on the servers table to optimize
     * high-frequency scheduler queries (e.g. CheckFreeServerActivityCommand running every minute,
     * tunnel polling, and tier filters) preventing CPU-heavy full table scans.
     */
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            // Index activity lifecycle timestamps
            if (Schema::hasColumn('servers', 'activity_expires_at')) {
                $table->index('activity_expires_at', 'servers_activity_expires_at_idx');
            }
            if (Schema::hasColumn('servers', 'deletion_deadline_at')) {
                $table->index('deletion_deadline_at', 'servers_deletion_deadline_at_idx');
            }
            if (Schema::hasColumn('servers', 'suspended_at')) {
                $table->index('suspended_at', 'servers_suspended_at_idx');
            }

            // Index plan tier & tunnel columns
            if (Schema::hasColumn('servers', 'plan_tier')) {
                $table->index('plan_tier', 'servers_plan_tier_idx');
            }
            if (Schema::hasColumn('servers', 'tunnel_status')) {
                $table->index('tunnel_status', 'servers_tunnel_status_idx');
            }

            // Composite index for minute-by-minute auto-suspension sweep
            if (
                Schema::hasColumn('servers', 'plan_tier') &&
                Schema::hasColumn('servers', 'status') &&
                Schema::hasColumn('servers', 'activity_expires_at')
            ) {
                $table->index(['plan_tier', 'status', 'activity_expires_at'], 'servers_suspension_sweep_idx');
            }

            // Composite index for 48h permanent deletion sweep
            if (
                Schema::hasColumn('servers', 'plan_tier') &&
                Schema::hasColumn('servers', 'status') &&
                Schema::hasColumn('servers', 'deletion_deadline_at')
            ) {
                $table->index(['plan_tier', 'status', 'deletion_deadline_at'], 'servers_deletion_sweep_idx');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $indexes = [
                'servers_activity_expires_at_idx',
                'servers_deletion_deadline_at_idx',
                'servers_suspended_at_idx',
                'servers_plan_tier_idx',
                'servers_tunnel_status_idx',
                'servers_suspension_sweep_idx',
                'servers_deletion_sweep_idx',
            ];

            foreach ($indexes as $index) {
                try {
                    $table->dropIndex($index);
                } catch (\Throwable $e) {
                    // Ignore if index doesn't exist
                }
            }
        });
    }
};
