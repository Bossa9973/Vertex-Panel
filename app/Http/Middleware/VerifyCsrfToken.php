<?php

namespace Convoy\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken as Middleware;

class VerifyCsrfToken extends Middleware
{
    /**
     * The URIs that should be excluded from CSRF verification.
     *
     * @var array<int, string>
     */
    protected $except = [
        'register',
        'auth/register',
        'login',
        'auth/login',
        'social',
        'auth/social',
        'api/bot/*',
        'api/client/webhooks/*',
    ];
}
