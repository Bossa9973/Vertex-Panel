<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_reseller')->default(false)->after('root_admin');
            $table->text('reseller_notes')->nullable()->after('is_reseller');
        });

        Schema::create('reseller_coin_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('coin', 20); // USDT, SOL, BTC, LTC, ETH, CREDITS
            $table->decimal('balance', 18, 8)->default(0);
            $table->decimal('locked_balance', 18, 8)->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'coin']);
        });

        Schema::create('reseller_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reseller_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('vps_plan_id')->constrained('vps_plans')->cascadeOnDelete();
            $table->enum('model_type', ['own_inventory', 'zero_cost'])->default('zero_cost');
            $table->decimal('base_price', 10, 2);
            $table->decimal('markup_percent', 5, 2)->default(0.00); // capped at 30.00% for zero_cost
            $table->decimal('custom_price', 10, 2);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('reseller_payment_links', function (Blueprint $table) {
            $table->id();
            $table->string('uuid')->unique();
            $table->foreignId('reseller_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reseller_plan_id')->nullable()->constrained('reseller_plans')->nullOnDelete();
            $table->foreignId('vps_plan_id')->constrained('vps_plans')->cascadeOnDelete();
            $table->foreignId('node_id')->nullable()->constrained('nodes')->nullOnDelete();
            $table->string('template_uuid');
            $table->string('server_name');
            $table->enum('model_type', ['own_inventory', 'zero_cost'])->default('zero_cost');
            $table->decimal('base_price', 10, 2);
            $table->decimal('selling_price', 10, 2);
            $table->decimal('markup_amount', 10, 2);
            $table->string('coin', 20)->default('USDT');
            $table->enum('status', ['pending', 'paid', 'expired'])->default('pending');
            $table->foreignId('client_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('server_id')->nullable()->constrained('servers')->nullOnDelete();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        Schema::create('reseller_withdrawals', function (Blueprint $table) {
            $table->id();
            $table->string('uuid')->unique();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('coin', 20);
            $table->decimal('amount', 18, 8);
            $table->string('wallet_address');
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->string('tx_hash')->nullable();
            $table->text('admin_notes')->nullable();
            $table->timestamps();
        });

        Schema::create('reseller_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('type', 40); // earnings_credit, withdrawal_locked, withdrawal_completed, withdrawal_refunded
            $table->string('coin', 20);
            $table->decimal('amount', 18, 8);
            $table->string('reference_id')->nullable();
            $table->string('description');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reseller_transactions');
        Schema::dropIfExists('reseller_withdrawals');
        Schema::dropIfExists('reseller_payment_links');
        Schema::dropIfExists('reseller_plans');
        Schema::dropIfExists('reseller_coin_balances');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['is_reseller', 'reseller_notes']);
        });
    }
};
