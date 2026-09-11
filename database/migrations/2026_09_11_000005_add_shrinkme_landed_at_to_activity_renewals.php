<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add shrinkme_landed_at to server_activity_renewals.
     *
     * This column is stamped by the /activity/landing-ping endpoint when the
     * user's browser arrives on the claim page with a valid Shrinkme Referer.
     * verifyCallback (Pillar 6) requires this stamp to be set when Shrinkme is
     * active, instead of relying on the Referer of the verify POST (which is
     * always the panel domain and therefore trivially bypassable).
     */
    public function up(): void
    {
        if (Schema::hasTable('server_activity_renewals') &&
            !Schema::hasColumn('server_activity_renewals', 'shrinkme_landed_at')) {
            Schema::table('server_activity_renewals', function (Blueprint $table) {
                $table->timestamp('shrinkme_landed_at')->nullable()->after('claim_referer');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('server_activity_renewals') &&
            Schema::hasColumn('server_activity_renewals', 'shrinkme_landed_at')) {
            Schema::table('server_activity_renewals', function (Blueprint $table) {
                $table->dropColumn('shrinkme_landed_at');
            });
        }
    }
};
