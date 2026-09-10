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
        if (!Schema::hasTable('server_activity_renewals')) {
            Schema::create('server_activity_renewals', function (Blueprint $table) {
                $table->id();
                $table->foreignId('server_id')->constrained('servers')->onDelete('cascade');
                $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
                $table->enum('session_type', ['active_renewal', 'reactivation_step'])->default('active_renewal');
                $table->unsignedTinyInteger('step_number')->default(1);
                $table->string('token', 64)->unique();
                $table->string('claim_code', 32)->unique();
                $table->text('shrinkme_url')->nullable();
                $table->text('destination_url');
                $table->enum('status', ['pending', 'verified', 'claimed', 'bypassed_rejected', 'expired'])->default('pending');
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->timestamp('started_at');
                $table->timestamp('verified_at')->nullable();
                $table->timestamp('claimed_at')->nullable();
                $table->timestamp('expires_at');
                $table->timestamps();

                $table->index(['server_id', 'status']);
                $table->index(['token', 'status']);
                $table->index(['claim_code', 'status']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('server_activity_renewals');
    }
};
