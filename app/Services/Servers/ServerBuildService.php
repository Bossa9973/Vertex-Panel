<?php

namespace Convoy\Services\Servers;

use Convoy\Models\Server;
use Convoy\Models\Template;
use Convoy\Repositories\Proxmox\Server\ProxmoxConfigRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxServerRepository;
use Convoy\Exceptions\Repository\Proxmox\ProxmoxConnectionException;

/**
 * Class SnapshotService
 */
class ServerBuildService
{
    public function __construct(
        private ProxmoxConfigRepository $configRepository,
        private ProxmoxServerRepository $serverRepository,
    ) {
    }

    public function delete(Server $server)
    {
        $this->serverRepository->setServer($server)->delete();
    }

    public function build(Server $server, Template $template)
    {
        $this->serverRepository->setServer($server)->create($template);
    }

    public function isVmCreated(Server $server): bool
    {
        // NOTE: We intentionally do NOT catch ProxmoxConnectionException here.
        // A network failure (cURL error 7, timeout, etc.) is NOT the same as
        // "VM is still being cloned". If the node is unreachable, the exception
        // will propagate to WaitUntilVmIsCreatedJob which will fail fast
        // instead of silently re-queuing for up to 30 minutes.
        $config = collect($this->configRepository->setServer($server)->getConfig());

        $lock = $config->where('key', '=', 'lock')->first();

        if ($lock && !empty($lock['value'])) {
            return false; // VM is still being cloned on Proxmox (lock is set)
        }

        return true;
    }

    public function isVmDeleted(Server $server): bool
    {
        try {
            $this->configRepository->setServer($server)->getConfig();
        } catch (ProxmoxConnectionException $e) {
            return true;
        }

        return false;
    }
}
