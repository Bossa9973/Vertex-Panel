<?php



use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            // SSH credentials used by UploadBackupToCloudJob to SFTP into the node.
            $table->string('ssh_host')->nullable()->after('fqdn');
            $table->unsignedSmallInteger('ssh_port')->default(22)->after('ssh_host');
            $table->string('ssh_username')->default('root')->after('ssh_port');
            // Stored encrypted at rest (same as Node::secret).
            $table->text('ssh_private_key')->nullable()->after('ssh_username');
            // Physical base path on the node where backup archives are stored.
            // Null = fall back to /var/lib/vz/dump (Proxmox default for dir storage).
            $table->string('backup_path')->nullable()->after('ssh_private_key');
        });
    }

    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn(['ssh_host', 'ssh_port', 'ssh_username', 'ssh_private_key', 'backup_path']);
        });
    }
};

