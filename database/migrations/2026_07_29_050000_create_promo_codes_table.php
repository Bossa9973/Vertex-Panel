<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promo_codes', function (Blueprint $table) {
            $table->string('code', 32)->primary();          // e.g. LMN-XXXX-XXXX
            $table->string('discord_id', 32)->index();      // issued to this Discord user
            $table->foreignId('user_id')                    // set when redeemed
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();
            $table->unsignedInteger('amount');              // credit/bolt value
            $table->boolean('used')->default(false)->index();
            $table->string('created_by_discord_id', 32);   // admin who generated it
            $table->timestamp('used_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promo_codes');
    }
};
