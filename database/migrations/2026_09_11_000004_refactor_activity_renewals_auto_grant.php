<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('server_activity_renewals', function (Blueprint $table) {
            // Make claim_code nullable (being phased out — auto-grant model has no codes)
            if (Schema::hasColumn('server_activity_renewals', 'claim_code')) {
                $table->string('claim_code', 32)->nullable()->change();
            }

            // Store the HTTP Referer header at verification time for audit trail
            if (!Schema::hasColumn('server_activity_renewals', 'claim_referer')) {
                $table->string('claim_referer', 512)->nullable()->after('client_nonce_hash');
            }
        });
    }

    public function down(): void
    {
        Schema::table('server_activity_renewals', function (Blueprint $table) {
            if (Schema::hasColumn('server_activity_renewals', 'claim_referer')) {
                $table->dropColumn('claim_referer');
            }
        });
    }
};
