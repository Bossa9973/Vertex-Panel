<?php

namespace Convoy\Services\Servers;

use Convoy\Models\Server;

class SshxSessionService
{
    public function __construct(private TmateSessionService $tmateService)
    {
    }

    /**
     * Create or fetch a unique web terminal collaborative session link for the server.
     */
    public function createSession(Server $server): array
    {
        return $this->tmateService->createSession($server);
    }
}
