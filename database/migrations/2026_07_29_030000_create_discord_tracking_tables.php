<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('discord_stats', function (Blueprint $table) {
            $table->string('discord_id', 32)->primary();
            $table->unsignedBigInteger('messages')->default(0);
            $table->unsignedBigInteger('boosts')->default(0);
            $table->timestamps();
        });

        Schema::create('discord_invites', function (Blueprint $table) {
            $table->string('code', 32)->primary();
            $table->string('inviter_discord_id', 32);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('discord_invited_users', function (Blueprint $table) {
            $table->string('discord_id', 32)->primary();
            $table->string('inviter_discord_id', 32)->index();
            $table->boolean('is_fake')->default(false);
            $table->enum('status', ['joined', 'left'])->default('joined');
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('discord_invited_users');
        Schema::dropIfExists('discord_invites');
        Schema::dropIfExists('discord_stats');
    }
};
