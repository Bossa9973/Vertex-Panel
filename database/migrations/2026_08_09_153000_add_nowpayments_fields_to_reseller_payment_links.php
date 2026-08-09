<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reseller_payment_links', function (Blueprint $table) {
            // Add NOWPayments columns (keep checkout_url which already exists)
            if (!Schema::hasColumn('reseller_payment_links', 'nowpayments_payment_id')) {
                $table->string('nowpayments_payment_id')->nullable()->after('coin');
            }
            if (!Schema::hasColumn('reseller_payment_links', 'nowpayments_status')) {
                $table->string('nowpayments_status')->default('pending')->after('nowpayments_payment_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('reseller_payment_links', function (Blueprint $table) {
            $table->dropColumn(['nowpayments_payment_id', 'nowpayments_status']);
        });
    }
};
