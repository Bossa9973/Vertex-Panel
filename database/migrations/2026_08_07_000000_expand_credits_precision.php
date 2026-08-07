<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        try {
            DB::statement("ALTER TABLE users MODIFY credits DECIMAL(16,2) NOT NULL DEFAULT 0.00");
        } catch (\Throwable $e) {}

        try {
            DB::statement("ALTER TABLE promo_codes MODIFY amount DECIMAL(16,2) NOT NULL");
        } catch (\Throwable $e) {}

        try {
            DB::statement("ALTER TABLE credit_transactions MODIFY amount DECIMAL(16,2) NOT NULL");
        } catch (\Throwable $e) {}
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
    }
};
