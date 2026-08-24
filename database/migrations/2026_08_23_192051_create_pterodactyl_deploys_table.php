<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pterodactyl_deploys', function (Blueprint $table) {
            $table->id();

            // Link to the user who ordered it
            $table->foreignId('user_id')
                  ->constrained()
                  ->cascadeOnDelete();

            // Link to the Proxmox Server record — nullable because we write this row
            // BEFORE VM creation so we have something to show if Proxmox fails
            $table->foreignId('server_id')
                  ->nullable()
                  ->constrained()
                  ->nullOnDelete();

            // Proxmox VMID — set after successful VM creation
            $table->unsignedBigInteger('vmid')->nullable();

            // Install lifecycle: pending → provisioning → installing → complete | failed
            $table->string('status')->default('pending');

            // Per-deploy secret the VM uses to authenticate its webhook POST.
            // NOT the BotApiSecret — generated fresh per deploy, 64 hex chars.
            $table->string('deploy_secret', 64)->unique();

            // Encrypted JSON — all client-supplied config + server-generated passwords.
            // Uses Laravel encrypted:array cast (requires APP_KEY).
            // WARNING: rotating APP_KEY makes existing rows unreadable.
            $table->text('config')->nullable();

            // Encrypted JSON — populated only when status = complete.
            // Contains panel_url, admin_email, admin_password, node_id, node_status.
            $table->text('credentials')->nullable();

            // Unencrypted convenience columns for quick display without decrypting config
            $table->string('panel_fqdn')->nullable();
            $table->string('wings_fqdn')->nullable();
            $table->unsignedInteger('ptero_node_id')->nullable();

            // Error message when status = failed
            $table->text('error')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pterodactyl_deploys');
    }
};
