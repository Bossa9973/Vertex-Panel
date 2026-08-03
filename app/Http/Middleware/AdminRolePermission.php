<?php

namespace Convoy\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

/**
 * Parameterised admin-permission middleware.
 *
 * Usage in routes:
 *   ->middleware('admin.perm:manage_balances')
 *
 * The authenticated user must be a root_admin AND possess the named permission.
 * Users with no assigned role (or the CEO super-admin) always pass.
 */
class AdminRolePermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();

        if (! $user || ! $user->hasAdminPermission($permission)) {
            throw new AccessDeniedHttpException(
                "You do not have the '{$permission}' permission required for this action."
            );
        }

        return $next($request);
    }
}
