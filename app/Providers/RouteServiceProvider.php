<?php

namespace Convoy\Providers;

use Convoy\Http\Middleware\AdminAuthenticate;
use Convoy\Http\Middleware\Coterm\CotermAuthenticate;
use Convoy\Models\Server;
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    /**
     * The path to the "home" route for your application.
     *
     * Typically, users are redirected here after authentication.
     *
     * @var string
     */
    public const HOME = '/';

    /**
     * Define your route model bindings, pattern filters, and other route configuration.
     */
    public function boot(): void
    {
        Route::bind('server', function ($value) {
            return Server::query()
                ->where('uuid_short', $value)
                ->orWhere('uuid', $value)
                ->when(is_numeric($value), function ($query) use ($value) {
                    return $query->orWhere('id', (int) $value);
                })
                ->firstOrFail();
        });

        $this->routes(function () {
            Route::middleware('web')->group(function () {
                Route::get('/locales/locale.json', \Convoy\Http\Controllers\Base\LocaleController::class)->where('namespace', '.*');
                Route::get('/api/announcement-status', [\Convoy\Http\Controllers\Client\IndexController::class, 'announcementStatus']);
                Route::get('/api/terminal-mode', [\Convoy\Http\Controllers\Client\IndexController::class, 'terminalMode']);
                Route::get('/api/maintenance-status', [\Convoy\Http\Controllers\Client\IndexController::class, 'maintenanceStatus']);

                // Social Auth Routes (Accessible to all users for linking / OAuth login)
                Route::get('/auth/login/{provider}', [\Convoy\Http\Controllers\Auth\SocialLoginController::class, 'redirect']);
                Route::get('/auth/login/{provider}/callback', [\Convoy\Http\Controllers\Auth\SocialLoginController::class, 'callback']);
                Route::get('/auth/social/{provider}/redirect', [\Convoy\Http\Controllers\Auth\SocialLoginController::class, 'redirect']);
                Route::get('/auth/social/{provider}/callback', [\Convoy\Http\Controllers\Auth\SocialLoginController::class, 'callback']);

                Route::middleware('guest')->group(base_path('routes/auth.php'));

                Route::middleware(['auth.session'])
                    ->group(base_path('routes/base.php'));

                Route::middleware(['auth'])->prefix('/api/client')
                    ->as('client.')
                    ->scopeBindings()
                    ->group(base_path('routes/api-client.php'));

                Route::middleware(['auth', AdminAuthenticate::class])
                    ->prefix('/api/admin')
                    ->as('admin.')
                    ->scopeBindings()
                    ->group(base_path('routes/api-admin.php'));

                // Discord Bot API — secured by BotApiAuthenticate (shared secret)
                Route::middleware([\Convoy\Http\Middleware\BotApiAuthenticate::class])
                    ->prefix('/api/bot')
                    ->as('bot.')
                    ->group(base_path('routes/api-bot.php'));
            });

            Route::middleware(['api'])->group(function () {
                Route::middleware(['auth:sanctum', AdminAuthenticate::class])
                    ->prefix('/api/application')
                    ->as('application.')
                    ->scopeBindings()
                    ->group(base_path('routes/api-application.php'));

                Route::middleware([CotermAuthenticate::class])
                    ->prefix('/api/coterm')
                    ->as('coterm.')
                    ->scopeBindings()
                    ->group(base_path('routes/api-coterm.php'));
            });
        });
    }
}
