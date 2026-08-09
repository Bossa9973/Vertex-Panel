<?php

namespace Convoy\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class AuthenticateReseller
{
    /**
     * Handle an incoming request for reseller routes.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user || (!$user->is_reseller && !$user->root_admin)) {
            throw new AccessDeniedHttpException('Reseller portal access is required.');
        }

        return $next($request);
    }
}
