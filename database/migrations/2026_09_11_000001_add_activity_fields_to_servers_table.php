<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            if (!Schema::hasColumn('servers', 'activity_expires_at')) {
                $table->timestamp('activity_expires_at')->nullable()->after('expires_at');
            }
            if (!Schema::hasColumn('servers', 'suspended_at')) {
                $table->timestamp('suspended_at')->nullable()->after('activity_expires_at');
            }
            if (!Schema::hasColumn('servers', 'deletion_deadline_at')) {
                $table->timestamp('deletion_deadline_at')->nullable()->after('suspended_at');
            }
            if (!Schema::hasColumn('servers', 'reactivation_codes_completed')) {
                $table->unsignedTinyInteger('reactivation_codes_completed')->default(0)->after('deletion_deadline_at');
            }
            if (!Schema::hasColumn('servers', 'reactivation_codes_required')) {
                $table->unsignedTinyInteger('reactivation_codes_required')->default(3)->after('reactivation_codes_completed');
            }
        });

        // Initialize activity_expires_at to 72 hours from now for existing free servers
        DB::table('servers')
            ->where(function ($query) {
                $query->where('plan_tier', '!=', 'paid')
                      ->orWhereNull('plan_tier');
            })
            ->whereNull('activity_expires_at')
            ->update([
                'activity_expires_at' => Carbon::now()->addHours(72),
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $columnsToDrop = [];
            foreach ([
                'activity_expires_at',
                'suspended_at',
                'deletion_deadline_at',
                'reactivation_codes_completed',
                'reactivation_codes_required'
            ] as $col) {
                if (Schema::hasColumn('servers', $col)) {
                    $columnsToDrop[] = $col;
                }
            }

            if (!empty($columnsToDrop)) {
                $table->dropColumn($columnsToDrop);
            }
        });
    }
};
