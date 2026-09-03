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
        if (!Schema::hasTable('server_relocations')) {
            Schema::create('server_relocations', function (Blueprint $table) {
                $table->id();
                $table->unsignedInteger('user_id')->index();
                $table->unsignedInteger('old_server_id')->nullable()->index();
                $table->unsignedInteger('new_server_id')->nullable()->index();
                $table->unsignedInteger('source_node_id')->index();
                $table->unsignedInteger('target_node_id')->index();
                $table->string('server_name', 191)->nullable();
                $table->string('status', 32)->default('initiated');
                $table->boolean('backup_success')->nullable();
                $table->boolean('reused_ip')->default(false);
                $table->string('old_ip', 64)->nullable();
                $table->string('new_ip', 64)->nullable();
                $table->string('admin_discord_id', 32)->nullable();
                $table->string('user_discord_id', 32)->nullable();
                $table->timestamp('old_expires_at')->nullable();
                $table->text('admin_notes')->nullable();
                $table->text('error')->nullable();
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('server_relocations');
    }
};
