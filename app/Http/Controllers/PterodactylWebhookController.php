<?php

namespace Convoy\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Convoy\Models\PterodactylDeploy;
use Convoy\Notifications\PterodactylDeployComplete;

/**
 * Receives the completion webhook POST from the VM after Pterodactyl installs.
 *
 * This controller is intentionally NOT placed in Controllers/Bot/ — it has a
 * completely different auth mechanism. The VM has no BOT_API_SECRET and no
 * Laravel session. Authentication is via deploy_secret in the request body,
 * compared with hash_equals() to resist timing attacks.
 *
 * Route placement: Route::middleware(['api']) group (no CSRF, no session).
 */
class PterodactylWebhookController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $request->validate([
            'deploy_id'     => ['required'],
            'deploy_secret' => ['required', 'string'],
        ]);

        $deploy = PterodactylDeploy::find($request->input('deploy_id'));

        // Don't reveal whether the deploy_id exists — always return 401
        if (! $deploy) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        // Constant-time comparison — never use === for secrets (timing attack)
        if (! hash_equals($deploy->deploy_secret, (string) $request->input('deploy_secret'))) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        // Idempotency — VM might retry on network blip
        if ($deploy->status === 'complete') {
            return response()->json(['ok' => true, 'note' => 'already processed']);
        }

        // Install failed on the VM — error field set
        if ($request->filled('error')) {
            $deploy->update([
                'status' => 'failed',
                'error'  => $request->input('error'),
            ]);
            return response()->json(['ok' => true]);
        }

        // Install succeeded — store encrypted credentials
        $credentials = [
            'panel_url'      => $request->input('panel_url'),
            'admin_email'    => $request->input('admin_email'),
            'admin_password' => $request->input('admin_password'),
            'node_id'        => $request->input('node_id'),
            'node_status'    => $request->input('node_status'),
        ];

        $deploy->update([
            'status'        => 'complete',
            'credentials'   => $credentials,   // encrypted at rest by cast
            'ptero_node_id' => $request->input('node_id'),
        ]);

        // Send credential email using existing Laravel mail stack
        $deploy->user->notify(new PterodactylDeployComplete($deploy));

        return response()->json(['ok' => true]);
    }
}
