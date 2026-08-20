<?php

namespace Convoy\Services;

use Convoy\Models\Server;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;

class VertexTunnelService
{
    /**
     * Generate an ed25519 keypair for this VM, register the public key with sish
     * (by writing it to the sish pubkeys directory), update the server record,
     * and return the private key string so the caller can inject it into cloud-init.
     *
     * NEVER persist the private key to the database.
     */
    public function provision(Server $server): string
    {
        $token   = Str::lower(Str::random(10));
        $keyPath = storage_path("app/tmp/vm_key_{$token}");

        @mkdir(storage_path('app/tmp'), 0700, true);

        Process::run(
            "ssh-keygen -t ed25519 -f {$keyPath} -N '' -C vm-{$token}"
        );

        $pub  = file_get_contents("{$keyPath}.pub");
        $priv = file_get_contents($keyPath);

        // Write to sish's watched pubkeys directory (hot-loaded every ~200 ms)
        file_put_contents(
            config('services.sish.pubkeys_path') . "/vm-{$token}.pub",
            $pub
        );

        $server->update([
            'tunnel_token'             => $token,
            'tunnel_status'            => 'pending',
            'tunnel_pubkey_registered' => true,
            'tunnel_port'              => null,
        ]);

        // Remove temporary key files from disk immediately — private key is never persisted
        @unlink($keyPath);
        @unlink("{$keyPath}.pub");

        Log::info("[VertexTunnel] Provisioned tunnel token vm-{$token} for server #{$server->id}");

        return $priv;
    }

    /**
     * Query the sish admin API, find this VM's tunnel entry by matching the
     * pubkey comment ("vm-{token}"), and extract the assigned port from the
     * first key of routeListeners.listeners.
     *
     * Returns the port if now active, or null if still connecting / not found.
     */
    public function pollAssignedPort(Server $server): ?int
    {
        if (! $server->tunnel_token) {
            return null;
        }

        $resp = Http::withHeaders([
            'Host' => config('services.sish.domain'),
        ])->get(config('services.sish.admin_console_url'), [
            'x-authorization' => config('services.sish.admin_token'),
        ]);

        if (! $resp->successful()) {
            Log::warning("[VertexTunnel] sish admin API returned {$resp->status()} for server #{$server->id}");
            return null;
        }

        $clients = $resp->json('clients', []);

        foreach ($clients as $client) {
            $pubKey = $client['pubKey'] ?? '';

            if (! str_contains($pubKey, 'vm-' . $server->tunnel_token)) {
                continue;
            }

            $listeners = $client['routeListeners']['listeners'] ?? [];

            if (empty($listeners)) {
                // Connected but port not yet bound — still pending
                return null;
            }

            $port = (int) array_key_first($listeners);

            if ($port > 0) {
                $server->update([
                    'tunnel_port'   => $port,
                    'tunnel_status' => 'active',
                ]);

                Log::info("[VertexTunnel] Port {$port} assigned to server #{$server->id} (token: vm-{$server->tunnel_token})");

                return $port;
            }
        }

        return null;
    }

    /**
     * Mark the tunnel offline and clear the assigned port.
     * Called when the VM is stopped or rebooted so the next boot triggers a re-poll.
     */
    public function markOffline(Server $server): void
    {
        $server->update([
            'tunnel_status' => 'offline',
            'tunnel_port'   => null,
        ]);

        Log::info("[VertexTunnel] Marked server #{$server->id} tunnel as offline");
    }

    /**
     * Return the user-facing SSH command string, or null if the tunnel is not yet active.
     */
    public function sshString(Server $server): ?string
    {
        if (! $server->tunnel_port) {
            return null;
        }

        return sprintf(
            'ssh root@%s -p %d',
            config('services.sish.domain'),
            $server->tunnel_port
        );
    }

    /**
     * Remove the VM's pubkey file from the sish pubkeys directory.
     * Call this during server deprovisioning / reinstall so the old key is revoked.
     */
    public function deprovision(Server $server): void
    {
        if (! $server->tunnel_token) {
            return;
        }

        $pubkeyFile = config('services.sish.pubkeys_path') . "/vm-{$server->tunnel_token}.pub";

        if (file_exists($pubkeyFile)) {
            @unlink($pubkeyFile);
            Log::info("[VertexTunnel] Removed pubkey for vm-{$server->tunnel_token} (server #{$server->id})");
        }

        $server->update([
            'tunnel_token'             => null,
            'tunnel_status'            => 'pending',
            'tunnel_pubkey_registered' => false,
            'tunnel_port'              => null,
        ]);
    }
}
