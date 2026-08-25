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
        if (Schema::hasTable('promo_codes')) {
            Schema::table('promo_codes', function (Blueprint $table) {
                if (!Schema::hasColumn('promo_codes', 'revoked')) {
                    $table->boolean('revoked')->default(false)->index()->after('used');
                }
                if (!Schema::hasColumn('promo_codes', 'revoked_at')) {
                    $table->timestamp('revoked_at')->nullable()->after('used_at');
                }
                if (!Schema::hasColumn('promo_codes', 'revoked_by_discord_id')) {
                    $table->string('revoked_by_discord_id', 32)->nullable()->after('created_by_discord_id');
                }
                if (!Schema::hasColumn('promo_codes', 'revoke_reason')) {
                    $table->string('revoke_reason', 255)->nullable()->after('reason');
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('promo_codes')) {
            Schema::table('promo_codes', function (Blueprint $table) {
                $cols = [];
                if (Schema::hasColumn('promo_codes', 'revoked')) {
                    $cols[] = 'revoked';
                }
                if (Schema::hasColumn('promo_codes', 'revoked_at')) {
                    $cols[] = 'revoked_at';
                }
                if (Schema::hasColumn('promo_codes', 'revoked_by_discord_id')) {
                    $cols[] = 'revoked_by_discord_id';
                }
                if (Schema::hasColumn('promo_codes', 'revoke_reason')) {
                    $cols[] = 'revoke_reason';
                }
                if (!empty($cols)) {
                    $table->dropColumn($cols);
                }
            });
        }
    }
};
