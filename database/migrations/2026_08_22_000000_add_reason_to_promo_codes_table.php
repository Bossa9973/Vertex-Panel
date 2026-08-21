<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('promo_codes') && !Schema::hasColumn('promo_codes', 'reason')) {
            Schema::table('promo_codes', function (Blueprint $table) {
                $table->string('reason', 255)->nullable()->after('created_by_discord_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('promo_codes') && Schema::hasColumn('promo_codes', 'reason')) {
            Schema::table('promo_codes', function (Blueprint $table) {
                $table->dropColumn('reason');
            });
        }
    }
};
