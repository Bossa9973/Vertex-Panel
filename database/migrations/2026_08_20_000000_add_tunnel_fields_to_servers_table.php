<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->string('tunnel_token')->nullable()->after('id');
            $table->unsignedInteger('tunnel_port')->nullable()->after('tunnel_token');
            $table->enum('tunnel_status', ['pending', 'active', 'offline'])
                  ->default('pending')->after('tunnel_port');
            $table->boolean('tunnel_pubkey_registered')->default(false)
                  ->after('tunnel_status');
        });
    }

    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            $table->dropColumn(['tunnel_token', 'tunnel_port', 'tunnel_status', 'tunnel_pubkey_registered']);
        });
    }
};
