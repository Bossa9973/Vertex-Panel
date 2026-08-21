<?php

namespace Convoy\Repositories\Proxmox\Server;

use Convoy\Models\Server;
use Webmozart\Assert\Assert;
use Convoy\Repositories\Proxmox\ProxmoxRepository;
use Convoy\Exceptions\Repository\Proxmox\ProxmoxConnectionException;

class ProxmoxGuestAgentRepository extends ProxmoxRepository
{
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

        $params = [
            'command' => ['/bin/sh', '-c', $command],
        ];

        $response = $this->getHttpClient()
            ->withUrlParameters([
                'node' => $this->node->cluster,
                'server' => $this->server->vmid,
            ])
            ->post('/api2/json/nodes/{node}/qemu/{server}/agent/exec', $params)
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