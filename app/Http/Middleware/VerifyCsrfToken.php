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
        // Social OAuth callbacks use state-based CSRF protection handled in the controller
        'social',
        'auth/social',
        // Webhook and bot API endpoints use token-based authentication
        'api/bot',
        'api/bot/*',
        'api/client/webhooks/*',
    ];
}

