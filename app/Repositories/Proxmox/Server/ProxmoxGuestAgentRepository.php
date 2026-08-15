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
     * Ping Guest Agent with configurable retries, delay, and optional logger callback.
     */
    public function pingWithRetry(int $retries = 3, int $delayMs = 2000, ?\Closure $logger = null): bool
    {
        Assert::isInstanceOf($this->server, Server::class);

        for ($i = 0; $i < $retries; $i++) {
            $attempt = $i + 1;
            try {
                $this->getHttpClient()
                    ->withUrlParameters([
                        'node'   => $this->node->cluster,
                        'server' => $this->server->vmid,
                    ])
                    ->post('/api2/json/nodes/{node}/qemu/{server}/agent/ping')
                    ->json();

                if ($logger) {
                    $logger("[INFO] Agent ping attempt {$attempt}/{$retries} for VM {$this->server->vmid}: SUCCESS");
                }
                return true;
            } catch (\Throwable $e) {
                if ($logger) {
                    $retryMsg = ($i < $retries - 1) ? "FAILED, retrying in " . ($delayMs / 1000) . "s..." : "FAILED (all attempts exhausted)";
                    $logger("[INFO] Agent ping attempt {$attempt}/{$retries} for VM {$this->server->vmid}: {$retryMsg}");
                }
                if ($i < $retries - 1) {
                    usleep($delayMs * 1000);
                }
            }
        }

        return false;
    }

    /**
     * Single-attempt ping method.
     */
    public function ping(): bool
    {
        return $this->pingWithRetry(1, 0);
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

        $response = $this->getHttpClient()
            ->withUrlParameters([
                'node' => $this->node->cluster,
                'server' => $this->server->vmid,
            ])
            ->post('/api2/json/nodes/{node}/qemu/{server}/agent/exec', [
                'command' => $command,
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