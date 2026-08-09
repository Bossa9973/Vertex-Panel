<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('reseller_plan_type')->nullable()->after('reseller_notes')
                ->comment('Reseller model: own_inventory or zero_cost');
        });

        Schema::table('reseller_payment_links', function (Blueprint $table) {
            $table->string('maxelpay_session_id')->nullable()->after('coin');
            $table->text('checkout_url')->nullable()->after('maxelpay_session_id');
            $table->string('maxelpay_status')->default('pending')->after('checkout_url');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('reseller_plan_type');
        });

        Schema::table('reseller_payment_links', function (Blueprint $table) {
            $table->dropColumn(['maxelpay_session_id', 'checkout_url', 'maxelpay_status']);
        });
    }
};
