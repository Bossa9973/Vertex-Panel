<?php

namespace Convoy\Services\Servers;

use Convoy\Data\Server\Deployments\ServerDeploymentData;
use Convoy\Enums\Server\Status;
use Convoy\Exceptions\Service\Deployment\InvalidTemplateException;
use Convoy\Exceptions\Service\Server\Allocation\NoUniqueUuidComboException;
use Convoy\Exceptions\Service\Server\Allocation\NoUniqueVmidException;
use Convoy\Models\Server;
use Convoy\Models\Template;
use Convoy\Repositories\Eloquent\ServerRepository;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

/**
 * Class ServerCreationService
 */
class ServerCreationService
{
    public function __construct(
        private NetworkService             $networkService, private ServerRepository $repository,
        private ServerBuildDispatchService $buildDispatchService,
    )
    {
    }

    public function handle(array $data)
    {
        $uuid = $this->generateUniqueUuidCombo();

        $shouldCreateServer = Arr::get($data, 'should_create_server');
        $template = $shouldCreateServer ? Template::where(
            'uuid', '=', Arr::get($data, 'template_uuid'),
        )->firstOrFail() : null;

        if ($template) {
            if ($template->group->node_id !== intval(Arr::get($data, 'node_id'))) {
                throw new InvalidTemplateException(
                    'This template is inaccessible to the specified node',
                );
            }
        }

        $nodeId = Arr::get($data, 'node_id');

        // Free tier resource quota check (16 cores, 96 GB RAM, 800 GB SSD)
        $userId = Arr::get($data, 'user_id');
        $user = $userId ? \Convoy\Models\User::find($userId) : null;
        $planTier = Arr::get($data, 'plan_tier', 'free');

        if ($user && !$user->root_admin) {
            if ($user->suspended_until && \Carbon\Carbon::parse($user->suspended_until)->isFuture()) {
                $until = \Carbon\Carbon::parse($user->suspended_until)->format('Y-m-d H:i');
                throw new \Exception("User account is suspended from deploying VPS servers until {$until}.");
            }
        }

        if ($user && !$user->root_admin && $planTier !== 'paid') {
            $freeServers = Server::where('user_id', $user->id)
                ->where(function ($q) {
                    $q->where('plan_tier', '!=', 'paid')->orWhereNull('plan_tier');
                })
                ->get();

            $currentCores = $freeServers->sum(fn($s) => (float) $s->cpu);
            $currentRamBytes = $freeServers->sum(fn($s) => $s->memory > 100000 ? (int) $s->memory : (int) $s->memory * 1024 * 1024);
            $currentDiskBytes = $freeServers->sum(fn($s) => $s->disk > 100000 ? (int) $s->disk : (int) $s->disk * 1024 * 1024 * 1024);

            $newCores = (float) Arr::get($data, 'limits.cpu', 0);
            $newRamBytes = (int) Arr::get($data, 'limits.memory', 0);
            $newDiskBytes = (int) Arr::get($data, 'limits.disk', 0);

            if (($currentCores + $newCores) > 16.0) {
                throw new \Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException(
                    "Free resource quota exceeded: Maximum CPU core limit is 16 cores (Currently used: {$currentCores}, Requested: {$newCores})."
                );
            }

            if (($currentRamBytes + $newRamBytes) > (96 * 1024 * 1024 * 1024)) {
                $usedGb = round($currentRamBytes / (1024 * 1024 * 1024), 1);
                $reqGb = round($newRamBytes / (1024 * 1024 * 1024), 1);
                throw new \Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException(
                    "Free resource quota exceeded: Maximum RAM limit is 96 GB (Currently used: {$usedGb} GB, Requested: {$reqGb} GB)."
                );
            }

            if (($currentDiskBytes + $newDiskBytes) > (800 * 1024 * 1024 * 1024)) {
                $usedGb = round($currentDiskBytes / (1024 * 1024 * 1024), 1);
                $reqGb = round($newDiskBytes / (1024 * 1024 * 1024), 1);
                throw new \Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException(
                    "Free resource quota exceeded: Maximum SSD storage limit is 800 GB (Currently used: {$usedGb} GB, Requested: {$reqGb} GB)."
                );
            }
        }

        $server = Server::create([
            'uuid' => $uuid,
            'uuid_short' => substr($uuid, 0, 8),
            'status' => $shouldCreateServer ? Status::INSTALLING->value : null,
            'name' => Arr::get($data, 'name'),
            'user_id' => Arr::get($data, 'user_id'),
            'node_id' => $nodeId,
            'vmid' => Arr::get($data, 'vmid') ?? $this->generateUniqueVmId($nodeId),
            'hostname' => Arr::get($data, 'hostname'),
            'cpu' => Arr::get($data, 'limits.cpu'),
            'memory' => Arr::get($data, 'limits.memory'),
            'disk' => Arr::get($data, 'limits.disk'),
            'snapshot_limit' => Arr::get($data, 'limits.snapshots'),
            'backup_limit' => Arr::get($data, 'limits.backups'),
            'bandwidth_limit' => Arr::get($data, 'limits.bandwidth'),
        ]);

        $server->refresh();

        $deployment = ServerDeploymentData::from([
            'server' => $server,
            'template' => $template,
            'account_password' => Arr::get($data, 'account_password'),
            'should_create_server' => $shouldCreateServer,
            'start_on_completion' => Arr::get($data, 'start_on_completion'),
        ]);

        $addressIds = Arr::get($data, 'limits.address_ids');

        if (empty($addressIds)) {
            // Automatically allocate an unassigned IP from this node's IPAM pool(s) on a random principle
            $autoIp = \Convoy\Models\Address::query()
                ->whereNull('server_id')
                ->whereIn('address_pool_id', function ($query) use ($nodeId) {
                    $query->select('address_pool_id')
                        ->from('address_pool_to_node')
                        ->where('node_id', $nodeId);
                })
                ->inRandomOrder()
                ->first();

            if ($autoIp) {
                $addressIds = [$autoIp->id];
            }
        }

        if (!empty($addressIds)) {
            $this->networkService->updateAddresses($server, $addressIds);
        }

        $this->buildDispatchService->build($deployment);

        return $server;
    }

    public function generateUniqueVmId(int $nodeId): int
    {
        $vmid = random_int(100, 999999999);
        $attempts = 0;

        while (!$this->repository->isUniqueVmId($nodeId, $vmid)) {
            $vmid = random_int(100, 999999999);

            if ($attempts++ > 10) {
                throw new NoUniqueVmidException();
            }
        }

        return $vmid;
    }

    public function generateUniqueUuidCombo(): string
    {
        $uuid = Str::uuid()->toString();
        $short = substr($uuid, 0, 8);
        $attempts = 0;

        while (!$this->repository->isUniqueUuidCombo($uuid, $short)) {
            $uuid = Str::uuid()->toString();
            $short = substr($uuid, 0, 8);

            if ($attempts++ > 10) {
                throw new NoUniqueUuidComboException();
            }
        }

        return $uuid;
    }
}
