<?php

use Convoy\Http\Controllers\Base;
use Illuminate\Support\Facades\Route;

Route::get('/', [Base\IndexController::class, 'index'])->name('index');
Route::get('/dashboard', [Base\IndexController::class, 'index'])->name('dashboard');

Route::get('/locales/locale.json', Base\LocaleController::class)
    ->where('namespace', '.*');

Route::get('/{any}', [Base\IndexController::class, 'index'])
    ->where('any', '^(?!(\/)?(api|authorize|horizon)).+');

