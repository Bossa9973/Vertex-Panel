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
        if (!Schema::hasTable('vps_plans')) {
            Schema::create('vps_plans', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->integer('ram'); // MB
                $table->integer('cpu'); // Cores
                $table->integer('disk'); // GB
                $table->decimal('price', 10, 2); // Monthly cost
                $table->string('description')->nullable();
                $table->timestamps();
            });

            // Seed initial default plans if empty
            DB::table('vps_plans')->insert([
                [
                    'name' => 'KVM Starter',
                    'ram' => 1024,
                    'cpu' => 1,
                    'disk' => 25,
                    'price' => 5.00,
                    'description' => 'Ideal for micro services, web hosting, and lightweight bots.',
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'name' => 'KVM Pro',
                    'ram' => 4096,
                    'cpu' => 2,
                    'disk' => 50,
                    'price' => 15.00,
                    'description' => 'High performance dual-core server for production applications.',
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
                [
                    'name' => 'KVM Enterprise',
                    'ram' => 8192,
                    'cpu' => 4,
                    'disk' => 100,
                    'price' => 30.00,
                    'description' => 'Dedicated quad-core performance for resource intensive workloads.',
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ]);
        }

        if (!Schema::hasColumn('servers', 'expires_at')) {
            Schema::table('servers', function (Blueprint $table) {
                $table->timestamp('expires_at')->nullable();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vps_plans');
        if (Schema::hasColumn('servers', 'expires_at')) {
            Schema::table('servers', function (Blueprint $table) {
                $table->dropColumn('expires_at');
            });
        }
    }
};
