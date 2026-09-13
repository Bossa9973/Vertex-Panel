<?php

use Convoy\Http\Controllers\Base;
use Illuminate\Support\Facades\Route;

Route::get('/', [Base\IndexController::class, 'index'])->name('index')->fallback();

Route::get('/locales/locale.json', Base\LocaleController::class)
    ->where('namespace', '.*');

// Lightweight public aliases for status endpoints to prevent 404 overhead
Route::get('/api/announcement-status', [\Convoy\Http\Controllers\Client\IndexController::class, 'announcementStatus']);
Route::get('/api/maintenance-status', [\Convoy\Http\Controllers\Client\IndexController::class, 'maintenanceStatus']);

Route::get('/{any}', [Base\IndexController::class, 'index'])
    ->where('any', '^(?!(\/)?(api|authorize|horizon)).+');
