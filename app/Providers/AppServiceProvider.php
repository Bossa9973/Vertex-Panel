<?php

namespace Convoy\Providers;

use Laravel\Sanctum\Sanctum;
use Convoy\Models\PersonalAccessToken;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

        if (!class_exists('App\Models\Server', false)) {
            class_alias(\Convoy\Models\Server::class, 'App\Models\Server');
        }
        if (!class_exists('Convoy\Services\VertexTunnelService', false)) {
            class_alias(\App\Services\VertexTunnelService::class, 'Convoy\Services\VertexTunnelService');
        }
    }
}
