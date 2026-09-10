<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('server_activity_renewals')) {
            Schema::table('server_activity_renewals', function (Blueprint $table) {
                if (!Schema::hasColumn('server_activity_renewals', 'client_nonce_hash')) {
                    $table->string('client_nonce_hash', 64)->nullable()->after('claim_code');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('server_activity_renewals')) {
            Schema::table('server_activity_renewals', function (Blueprint $table) {
                if (Schema::hasColumn('server_activity_renewals', 'client_nonce_hash')) {
                    $table->dropColumn('client_nonce_hash');
                }
            });
        }
    }
};
