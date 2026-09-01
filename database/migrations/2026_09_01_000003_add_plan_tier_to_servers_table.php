<?php



use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            // Determines the service tier for a server.
            // paid   = purchased (auto-backups enabled, badge shown in UI)
            // free   = complimentary / unpaid (no auto-backups)
            $table->string('plan_tier')->default('free')->after('backup_limit');
        });
    }

    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->dropColumn('plan_tier');
        });
    }
};

