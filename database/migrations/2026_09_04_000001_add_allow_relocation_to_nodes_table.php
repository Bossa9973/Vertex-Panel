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
        if (Schema::hasTable('nodes') && !Schema::hasColumn('nodes', 'allow_relocation')) {
            Schema::table('nodes', function (Blueprint $table) {
                $table->boolean('allow_relocation')->default(true)->after('hidden');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('nodes') && Schema::hasColumn('nodes', 'allow_relocation')) {
            Schema::table('nodes', function (Blueprint $table) {
                $table->dropColumn('allow_relocation');
            });
        }
    }
};
