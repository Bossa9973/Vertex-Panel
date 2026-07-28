<?php

use Convoy\Http\Controllers\Auth\LoginController;
use Convoy\Http\Controllers\Auth\RegisterController;
use Convoy\Http\Controllers\Auth\SocialLoginController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Authentication Controller Routes
|--------------------------------------------------------------------------
*/

Route::get('/locales/locale.json', Convoy\Http\Controllers\Base\LocaleController::class)->where('namespace', '.*');
Route::get('/login', [Convoy\Http\Controllers\Base\IndexController::class, 'index']);
Route::get('/register', [Convoy\Http\Controllers\Base\IndexController::class, 'index']);
Route::get('/authenticate', [LoginController::class, 'authorizeToken']);
Route::post('/login', [LoginController::class, 'login']);
Route::post('/register', [RegisterController::class, 'register']);
Route::post('/auth/register', [RegisterController::class, 'register']);

// Real OAuth2 Social Authentication Routes (Google & Discord)
Route::get('/auth/social/{provider}/redirect', [SocialLoginController::class, 'redirect']);
Route::get('/auth/social/{provider}/callback', [SocialLoginController::class, 'callback']);
