<?php

use Convoy\Http\Controllers\Client;
use Convoy\Http\Middleware\Activity\ServerSubject;
use Convoy\Http\Middleware\Client\Server\AuthenticateServerAccess;
use Illuminate\Support\Facades\Route;

Route::get('/servers', [Client\IndexController::class, 'index']);
Route::get('/announcement-status', [Client\IndexController::class, 'announcementStatus']);
Route::get('/terminal-mode', [Client\IndexController::class, 'terminalMode']);

Route::prefix('/credits')->group(function () {
    Route::get('/', [Client\CreditsController::class, 'index']);
    Route::post('/topup', [Client\CreditsController::class, 'topup']);
});

Route::prefix('/earn')->group(function () {
    Route::get('/status', [Client\EarnBoltsController::class, 'status']);
    Route::post('/claim', [Client\EarnBoltsController::class, 'claimReward']);
    Route::post('/connect-discord', [Client\EarnBoltsController::class, 'connectDiscord']);
});

Route::prefix('/account')->group(function () {
    Route::get('/', [Client\AccountController::class, 'index']);
    Route::post('/profile', [Client\AccountController::class, 'updateProfile']);
    Route::post('/unlink', [Client\AccountController::class, 'unlinkProvider']);
    Route::post('/redeem', [Client\AccountController::class, 'redeemPromoCode']);
});

Route::get('/plans', [Client\ServerDeployController::class, 'getOptions']);
Route::post('/deploy', [Client\ServerDeployController::class, 'deploy']);
Route::delete('/servers/{uuid}', [Client\ServerDeployController::class, 'destroy']);
Route::post('/servers/{id}/renew', [Client\ServerDeployController::class, 'renew']);

Route::prefix('/servers/{server}')->middleware(
    [ServerSubject::class, AuthenticateServerAccess::class],
)->group(function () {
    Route::get('/', [Client\Servers\ServerController::class, 'index'])->name('servers.show');
    Route::get('/details', [Client\Servers\ServerController::class, 'details']);

    Route::get('/state', [Client\Servers\ServerController::class, 'getState'])->name('servers.state');
    Route::patch('/state', [Client\Servers\ServerController::class, 'updateState']);

    Route::post(
        '/create-console-session', [Client\Servers\ServerController::class, 'createConsoleSession'],
    );
    Route::post(
        '/create-sshx-session', [Client\Servers\ServerController::class, 'createSshxSession'],
    );
    Route::post(
        '/sshx-webhook', [Client\Servers\ServerController::class, 'sshxWebhook'],
    );

    Route::prefix('/backups')->group(function () {
        Route::get('/', [Client\Servers\BackupController::class, 'index']);
        Route::post('/', [Client\Servers\BackupController::class, 'store']);
        Route::post('/{backup}/restore', [Client\Servers\BackupController::class, 'restore']);
        Route::delete('/{backup}', [Client\Servers\BackupController::class, 'destroy']);
    });

    Route::prefix('/settings')->group(function () {
        Route::post('/rename', [Client\Servers\SettingsController::class, 'rename']);
        Route::get(
            '/template-groups', [Client\Servers\SettingsController::class, 'getTemplateGroups'],
        );
        Route::post('/reinstall', [Client\Servers\SettingsController::class, 'reinstall']);

        Route::get(
            '/hardware/boot-order', [Client\Servers\SettingsController::class, 'getBootOrder'],
        );
        Route::put(
            '/hardware/boot-order', [Client\Servers\SettingsController::class, 'updateBootOrder'],
        );

        Route::get('/hardware/isos', [Client\Servers\SettingsController::class, 'getMedia']);
        Route::post(
            '/hardware/isos/{iso}/mount', [Client\Servers\SettingsController::class, 'mountMedia'],
        )->withoutScopedBindings();
        Route::post(
            '/hardware/isos/{iso}/unmount',
            [Client\Servers\SettingsController::class, 'unmountMedia'],
        )->withoutScopedBindings();

        Route::get('/network', [Client\Servers\SettingsController::class, 'getNetworkSettings']);
        Route::put('/network', [Client\Servers\SettingsController::class, 'updateNetworkSettings']);

        Route::get('/auth', [Client\Servers\SettingsController::class, 'getAuthSettings']);
        Route::put('/auth', [Client\Servers\SettingsController::class, 'updateAuthSettings']);
    });
});

/*
|--------------------------------------------------------------------------
| Reseller Portal & Payment Links Routes
|--------------------------------------------------------------------------
*/
Route::prefix('/reseller')->middleware(\Convoy\Http\Middleware\AuthenticateReseller::class)->group(function () {
    Route::get('/overview', [Client\Reseller\ResellerController::class, 'overview']);
    Route::get('/plans', [Client\Reseller\ResellerController::class, 'getPlans']);
    Route::post('/plans', [Client\Reseller\ResellerController::class, 'savePlanMarkup']);
    Route::get('/links', [Client\Reseller\ResellerController::class, 'getPaymentLinks']);
    Route::post('/links', [Client\Reseller\ResellerController::class, 'createPaymentLink']);
    Route::post('/withdraw', [Client\Reseller\ResellerController::class, 'withdraw']);
    Route::get('/withdrawals', [Client\Reseller\ResellerController::class, 'getWithdrawals']);
});

Route::get('/pay/{uuid}', [Client\Reseller\PublicPaymentLinkController::class, 'show']);
Route::post('/pay/{uuid}', [Client\Reseller\PublicPaymentLinkController::class, 'pay']);

/*
|--------------------------------------------------------------------------
| Payment Gateway Webhooks (no auth, CSRF exempt — verified by HMAC signature)
|--------------------------------------------------------------------------
*/
Route::post('/webhooks/maxelpay', [Client\Reseller\MaxelpayWebhookController::class, 'handle'])
    ->withoutMiddleware(['auth:sanctum', 'auth', 'verified', \Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class]);

Route::post('/webhooks/nowpayments', [Client\Reseller\NowPaymentsWebhookController::class, 'handle'])
    ->withoutMiddleware(['auth:sanctum', 'auth', 'verified', \Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class]);
