<?php
namespace Convoy\Services;

use Convoy\Models\Server;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;

class VertexTunnelService
{
    public function provision(Server $server): string
    {
        $token = Str::lower(Str::random(10));
        $keyPath = storage_path("app/tmp/vm_key_{$token}");
        @mkdir(storage_path('app/tmp'), 0700, true);

        Process::run("ssh-keygen -t ed25519 -f {$keyPath} -N '' -C vm-{$token}");

        $pub  = file_get_contents("{$keyPath}.pub");
        $priv = file_get_contents($keyPath);

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

        unlink($keyPath);
        unlink("{$keyPath}.pub");

        return $priv;
    }

    public function pollAssignedPort(Server $server): ?int
    {
        if (!$server->tunnel_token) return null;

        $resp = Http::withHeaders([
            'Host' => config('services.sish.domain'),
        ])->get(config('services.sish.admin_console_url'), [
            'x-authorization' => config('services.sish.admin_token'),
        ]);

        if (!$resp->successful()) return null;

        foreach ($resp->json('clients', []) as $client) {
            if (!str_contains($client['pubKey'] ?? '', 'vm-' . $server->tunnel_token)) {
                continue;
            }
            $listeners = $client['routeListeners']['listeners'] ?? [];
            if (empty($listeners)) return null;
            $port = (int) array_key_first($listeners);
            if ($port > 0) {
                $server->update(['tunnel_port' => $port, 'tunnel_status' => 'active']);
                return $port;
            }
        }

        return null;
    }

    public function markOffline(Server $server): void
    {
        $server->update(['tunnel_status' => 'offline', 'tunnel_port' => null]);
    }

    public function sshString(Server $server): ?string
    {
        if (!$server->tunnel_port) return null;
        return "ssh root@" . config('services.sish.domain') . " -p {$server->tunnel_port}";
    }
}
