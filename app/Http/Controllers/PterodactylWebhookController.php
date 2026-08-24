<?php

namespace Convoy\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Convoy\Models\PterodactylDeploy;

/**
 * Receives the completion webhook POST from the VM after Pterodactyl installs.
 *
 * Auth: deploy_secret in request body — hash_equals() to resist timing attacks.
 * Route: Route::middleware(['api']) group (no CSRF, no session).
 *
 * On success: stores encrypted credentials, fires Discord DM to the user
 * via the bot API (POST /api/bot/ptero-complete).
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

            // Notify user of failure via Discord DM
            $this->notifyDiscord($deploy, null, $request->input('error'));

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

        // Notify the user via Discord DM through the bot
        $this->notifyDiscord($deploy, $credentials, null);

        return response()->json(['ok' => true]);
    }

    /**
     * Fire a Discord DM to the deploying user via the bot API.
     *
     * The bot listens on POST /api/bot/ptero-complete and sends a DM embed
     * with the panel credentials. If the user has no discord_id linked
     * we log it and move on — credentials are always visible in the dashboard.
     */
    private function notifyDiscord(PterodactylDeploy $deploy, ?array $credentials, ?string $error): void
    {
        $user      = $deploy->user;
        $discordId = $user?->discord_id;

        if (! $discordId) {
            Log::info("PterodactylWebhookController: user #{$user?->id} has no discord_id; skipping DM.");
            return;
        }

        $botUrl    = rtrim(config('services.bot.url', env('BOT_API_URL', 'http://localhost:5000')), '/');
        $botSecret = config('services.bot.secret', env('BOT_API_SECRET', ''));

        try {
            Http::withHeaders([
                'Authorization' => "Bot {$botSecret}",
                'Accept'        => 'application/json',
            ])->timeout(8)->post("{$botUrl}/api/bot/ptero-complete", [
                'discord_id'     => $discordId,
                'deploy_id'      => $deploy->id,
                'status'         => $error ? 'failed' : 'complete',
                'panel_url'      => $credentials['panel_url']      ?? null,
                'admin_email'    => $credentials['admin_email']    ?? null,
                'admin_password' => $credentials['admin_password'] ?? null,
                'panel_fqdn'     => $deploy->panel_fqdn,
                'wings_fqdn'     => $deploy->wings_fqdn,
                'error'          => $error,
            ]);
        } catch (\Throwable $e) {
            // Non-fatal — credentials are in the dashboard regardless
            Log::warning("PterodactylWebhookController: Discord DM failed for deploy #{$deploy->id}: {$e->getMessage()}");
        }
    }
}
