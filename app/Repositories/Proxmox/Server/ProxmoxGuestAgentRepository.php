<?php

namespace Convoy\Repositories\Proxmox\Server;

use Convoy\Models\Server;
use Illuminate\Support\Str;
use Webmozart\Assert\Assert;
use Illuminate\Support\Facades\Log;
use Convoy\Repositories\Proxmox\ProxmoxRepository;
use Convoy\Exceptions\Repository\Proxmox\ProxmoxConnectionException;

class ProxmoxGuestAgentRepository extends ProxmoxRepository
{
    /**
     * Ping Guest Agent to verify if it is active and responding.
     */
    public function ping(): bool
    {
        Assert::isInstanceOf($this->server, Server::class);

        // Retry up to 3 times with 1.5 s between attempts.
        // The QEMU guest agent can be transiently unresponsive
        // (e.g. during heavy VM load or a brief service restart)
        // and a single ping failure should not trigger a fallback.
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            try {
                $this->getHttpClient()
                    ->withUrlParameters([
                        'node'   => $this->node->cluster,
                        'server' => $this->server->vmid,
                    ])
                    ->post('/api2/json/nodes/{node}/qemu/{server}/agent/ping')
                    ->json();

                return true;
            } catch (\Throwable) {
                if ($attempt < 3) {
                    usleep(1500000); // 1.5 s before next attempt
                }
            }
        }

        return false;
    }


    /**
     * Get Guest Agent status.
     *
     * @return mixed
     *
     * @throws ProxmoxConnectionException
     */
    public function guestAgentOs()
    {
        Assert::isInstanceOf($this->server, Server::class);

        $response = $this->getHttpClient()
            ->withUrlParameters([
                'node' => $this->node->cluster,
                'server' => $this->server->vmid,
            ])
            ->get('/api2/json/nodes/{node}/qemu/{server}/agent/get-osinfo')
            ->json();

        return $this->getData($response);
    }

    /**
     * Update Guest Agent password for Administrator user.
     *
     * @param string $password
     * @return mixed
     *
     * @throws ProxmoxConnectionException
     */
    public function updateGuestAgentPassword(string $username, string $password)
    {
        Assert::isInstanceOf($this->server, Server::class);

        $params = [
            'username' => $username,
            'password' => $password,
        ];

        $response = $this->getHttpClient()
            ->withUrlParameters([
                'node' => $this->node->cluster,
                'server' => $this->server->vmid,
            ])
            ->post('/api2/json/nodes/{node}/qemu/{server}/agent/set-user-password', $params)
            ->json();

        return $this->getData($response);
    }

    /**
     * Execute command inside VM via Proxmox QEMU Guest Agent.
     */
    public function exec(string $command)
    {
        Assert::isInstanceOf($this->server, Server::class);

        // Proxmox REST API expects 'command' as a string.
        // We wrap complex scripts in a base64 pipe to guarantee zero shell escaping issues.
        $b64 = base64_encode($command);
        $execString = "/bin/sh -c \"echo {$b64} | base64 -d | /bin/sh\"";

        $response = $this->getHttpClient()
            ->withUrlParameters([
                'node' => $this->node->cluster,
                'server' => $this->server->vmid,
            ])
            ->post('/api2/json/nodes/{node}/qemu/{server}/agent/exec', [
                'command' => $execString,
            ])
            ->json();

        return $this->getData($response);
    }

    /**
     * Write file inside VM via Proxmox QEMU Guest Agent.
     */
    public function fileWrite(string $file, string $content, bool $encode = true)
    {
        Assert::isInstanceOf($this->server, Server::class);

        $params = [
            'file' => $file,
            'content' => $encode ? base64_encode($content) : $content,
            'encode' => $encode ? 1 : 0,
        ];

        $response = $this->getHttpClient()
            ->withUrlParameters([
                'node' => $this->node->cluster,
                'server' => $this->server->vmid,
            ])
            ->post('/api2/json/nodes/{node}/qemu/{server}/agent/file-write', $params)
            ->json();

        return $this->getData($response);
    }

    /**
     * Read file inside VM via Proxmox QEMU Guest Agent (GET request).
     */
    public function fileRead(string $file)
    {
        Assert::isInstanceOf($this->server, Server::class);

        $response = $this->getHttpClient()
            ->withUrlParameters([
                'node' => $this->node->cluster,
                'server' => $this->server->vmid,
            ])
            ->get('/api2/json/nodes/{node}/qemu/{server}/agent/file-read', [
                'file' => $file,
            ])
            ->json();

        return $this->getData($response);
    }

    /**
     * Get exec status for a command PID.
     */
    public function execStatus(int $pid)
    {
        Assert::isInstanceOf($this->server, Server::class);

        $response = $this->getHttpClient()
            ->withUrlParameters([
                'node' => $this->node->cluster,
                'server' => $this->server->vmid,
            ])
            ->get('/api2/json/nodes/{node}/qemu/{server}/agent/exec-status', [
                'pid' => $pid,
            ])
            ->json();

        return $this->getData($response);
    }
}