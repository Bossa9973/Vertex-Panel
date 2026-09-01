<?php



use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('backups', function (Blueprint $table) {
            // Tracks the lifecycle of a backup's journey to Google Drive.
            // pending   = waiting for Proxmox backup to finish
            // uploading = actively being streamed to Drive via SFTP
            // uploaded  = successfully stored in Drive
            // failed    = upload failed after all retries
            $table->string('cloud_status')->default('pending')->after('completed_at');

            // Drive file path (e.g. node-1 (NYC)/server-42 (vm.host)/vzdump-...vma.zst)
            // NEVER returned to the client — used internally to generate signed download URLs.
            $table->string('cloud_path')->nullable()->after('cloud_status');

            $table->timestamp('cloud_uploaded_at')->nullable()->after('cloud_path');
        });
    }

    public function down(): void
    {
        Schema::table('backups', function (Blueprint $table) {
            $table->dropColumn(['cloud_status', 'cloud_path', 'cloud_uploaded_at']);
        });
    }
};

