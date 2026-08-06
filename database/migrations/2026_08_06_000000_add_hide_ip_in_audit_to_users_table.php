<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'hide_ip_in_audit')) {
                $table->boolean('hide_ip_in_audit')->default(false)->after('root_admin');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'hide_ip_in_audit')) {
                $table->dropColumn('hide_ip_in_audit');
            }
        });
    }
};
