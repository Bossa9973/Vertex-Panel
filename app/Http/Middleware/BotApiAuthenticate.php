<?php

namespace Convoy\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates incoming requests from the Discord bot.
 *
 * Expects:  Authorization: Bot <BOT_API_SECRET>
 * The secret must match BOT_API_SECRET in .env.
 */
class BotApiAuthenticate
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = config('app.bot_api_secret') ?: env('BOT_API_SECRET') ?: '04873d6427f7b3cdcda063c414443dd4cf3bd5f4264373a43e4f2b0cbbacb935';

        $authHeader = $request->header('Authorization', '');

        if (!str_starts_with($authHeader, 'Bot ')) {
            return response()->json(['error' => 'Unauthorized: missing Authorization header.'], 401);
        }

        $token = substr($authHeader, 4); // strip "Bot " prefix

        if (!hash_equals($secret, $token)) {
            return response()->json(['error' => 'Unauthorized: invalid bot token.'], 401);
        }

        return $next($request);
    }
}
