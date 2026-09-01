<?php

namespace Convoy\Http\Controllers\Admin;

use Convoy\Enums\Server\BackupCompressionType;
use Convoy\Enums\Server\BackupMode;
use Convoy\Enums\Server\Status;
use Convoy\Enums\Server\SuspensionAction;
use Convoy\Exceptions\Repository\Proxmox\ProxmoxConnectionException;
use Convoy\Exceptions\Service\Backup\TooManyBackupsException;
use Convoy\Http\Controllers\ApiController;
use Convoy\Http\Requests\Admin\Servers\Settings\UpdateBuildRequest;
use Convoy\Http\Requests\Admin\Servers\Settings\UpdateGeneralInfoRequest;
use Convoy\Http\Requests\Admin\Servers\StoreServerRequest;
use Convoy\Models\Filters\FiltersServerByAddressPoolId;
use Convoy\Models\Filters\FiltersServerWildcard;
use Convoy\Models\Server;
use Convoy\Services\Backups\BackupCreationService;
use Convoy\Services\Servers\CloudinitService;
use Convoy\Services\Servers\NetworkService;
use Convoy\Services\Servers\ServerCreationService;
use Convoy\Services\Servers\ServerDeletionService;
use Convoy\Services\Servers\ServerSuspensionService;
use Convoy\Services\Servers\SyncBuildService;
use Convoy\Transformers\Admin\ServerBuildTransformer;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsHttpException;
use Throwable;

class ServerController extends ApiController
{
    public function __construct(
        private ConnectionInterface     $connection,
        private ServerDeletionService   $deletionService,
        private NetworkService          $networkService,
        private ServerSuspensionService $suspensionService,
        private ServerCreationService   $creationService,
        private CloudinitService        $cloudinitService,
        private SyncBuildService        $buildModificationService,
        private BackupCreationService   $backupCreationService,
    )
    {
    }

    public function index(Request $request)
    {
        $servers = QueryBuilder::for(Server::query())
                               ->with(['addresses', 'user', 'node'])
                               ->defaultSort('-id')
                               ->allowedFilters(
                                   [
                                       AllowedFilter::custom(
                                           '*', new FiltersServerWildcard(),
                                       ),
                                       AllowedFilter::custom(
                                           'address_pool_id',
                                           new FiltersServerByAddressPoolId(),
                                       ),
                                       AllowedFilter::exact('node_id'),
                                       AllowedFilter::exact('user_id'),
                                       'name',
                                   ],
                               )
                               ->paginate(min($request->query('per_page', 50), 100))->appends(
                $request->query(),
            );

        return fractal($servers, new ServerBuildTransformer())->parseIncludes($request->include)
                                                              ->respond();
    }

    public function show(Request $request, Server $server)
    {
        $server->load(['addresses', 'user', 'node']);

        return fractal($server, new ServerBuildTransformer())->parseIncludes($request->include)
                                                             ->respond();
    }

    public function store(StoreServerRequest $request)
    {
        $server = $this->creationService->handle($request->validated());

        $server->load(['addresses', 'user', 'node']);

        return fractal($server, new ServerBuildTransformer())->parseIncludes(['user', 'node'])
                                                             ->respond();
    }

    public function update(UpdateGeneralInfoRequest $request, Server $server)
    {
        $this->connection->transaction(function () use ($request, $server) {
            if ($request->hostname !== $server->hostname && !empty($request->hostname)) {
                try {
                    $this->cloudinitService->updateHostname($server, $request->hostname);
                } catch (ProxmoxConnectionException) {
                    throw new ServiceUnavailableHttpException(
                        message: "Server {$server->uuid} failed to sync hostname.",
                    );
                }
            }

            $server->update($request->validated());
        });

        $server->load(['addresses', 'user', 'node']);

        return fractal($server, new ServerBuildTransformer())->parseIncludes(['user', 'node'])
                                                             ->respond();
    }

    
    public function setTier(Request $request, Server $server)
    {
        $validated = $request->validate([
            'tier' => 'required|string|in:free,paid',
        ]);

        $server->update(['plan_tier' => $validated['tier']]);

        return response()->json([
            'ok' => true,
            'server_id' => $server->id,
            'name' => $server->name,
            'plan_tier' => $server->plan_tier,
            'message' => "Server #{$server->id} ({$server->name}) plan tier updated to {$server->plan_tier}.",
        ]);
    }
    public function updateBuild(UpdateBuildRequest $request, Server $server)
    {
        $server->update($request->safe()->except('address_ids'));

        $this->networkService->updateAddresses($server, $request->address_ids ?? []);

        try {
            $this->buildModificationService->handle($server);
        } catch (ProxmoxConnectionException $e) {
            // do nothing
        }

        $server->load(['addresses', 'user', 'node']);

        return fractal($server, new ServerBuildTransformer())->parseIncludes(['user', 'node'])
                                                             ->respond();
    }

    public function suspend(Server $server)
    {
        $this->suspensionService->toggle($server);

        return $this->returnNoContent();
    }

    public function unsuspend(Server $server)
    {
        $this->suspensionService->toggle($server, SuspensionAction::UNSUSPEND);

        return $this->returnNoContent();
    }

    public function destroy(Request $request, Server $server)
    {
        $this->connection->transaction(function () use ($server, $request) {
            $server->update(['status' => Status::DELETING->value]);

            $this->deletionService->handle($server, $request->input('no_purge', false));
        });

        return $this->returnNoContent();
    }

    public function bulkDelete(Request $request)
    {
        $validated = $request->validate([
            'server_ids'   => 'required|array|min:1',
            'server_ids.*' => 'required|integer|exists:servers,id',
            'force'        => 'nullable|boolean',
        ]);

        $force = (bool) ($validated['force'] ?? false);
        $dispatched = 0;
        $wiped = 0;

        $servers = Server::whereIn('id', $validated['server_ids'])->get();

        foreach ($servers as $server) {
            if ($force) {
                $server->addresses()->update(['server_id' => null]);
                $server->delete();
                $wiped++;
            } else {
                $server->update(['status' => null]);

                try {
                    $this->deletionService->handle($server);
                    $dispatched++;
                } catch (\Throwable $e) {
                    $server->update(['status' => \Convoy\Enums\Server\Status::DELETION_FAILED->value]);
                }
            }
        }

        $message = $force
            ? "Force-wiped {$wiped} server(s) from the database."
            : "Queued deletion for {$dispatched} server(s). Failed servers will appear in the Failed Uninstalls tab.";

        return response()->json([
            'success'     => true,
            'message'     => $message,
            'dispatched'  => $dispatched,
            'wiped'       => $wiped,
        ]);
    }

    /**
     * Admin action to trigger VM backups and push to Google Drive.
     * Can trigger for all servers or a specific list of server IDs.
     */
    public function triggerBackups(Request $request)
    {
        $validated = $request->validate([
            'server_ids'   => 'nullable|array',
            'server_ids.*' => 'integer|exists:servers,id',
            'node_id'      => 'nullable|integer|exists:nodes,id',
            'tier'         => 'nullable|string|in:all,paid,free',
            'all'          => 'nullable|boolean',
            'force'        => 'nullable|boolean',
        ]);

        $query = Server::query();

        // Filter by specific server IDs
        if (!empty($validated['server_ids'])) {
            $query->whereIn('id', $validated['server_ids']);
        } else {
            // Filter by node if specified
            if (!empty($validated['node_id'])) {
                $query->where('node_id', $validated['node_id']);
            }

            // Filter by plan tier if specified (and not 'all')
            $tier = $validated['tier'] ?? 'all';
            if ($tier === 'paid') {
                $query->where('plan_tier', 'paid');
            } elseif ($tier === 'free') {
                $query->where('plan_tier', 'free');
            }
            // tier=all or not set: no filter applied
        }

        // Respect the 24h window unless force=true
        if (!($validated['force'] ?? true)) {
            $query->whereDoesntHave('backups', function ($q) {
                $q->where('created_at', '>', now()->subDay());
            });
        }

        $servers = $query->get();
        $dispatched = 0;
        $skipped = 0;

        foreach ($servers as $server) {
            try {
                $this->backupCreationService->create(
                    server         : $server,
                    name           : 'Admin backup (' . now()->format('Y-m-d H:i') . ')',
                    mode           : BackupMode::SNAPSHOT,
                    compressionType: BackupCompressionType::ZSTD,
                    isLocked       : false,
                );
                $dispatched++;
            } catch (TooManyBackupsException|TooManyRequestsHttpException $e) {
                $skipped++;
                Log::warning("[AdminTriggerBackups] Skipped server #{$server->id}: " . $e->getMessage());
            } catch (Throwable $e) {
                $skipped++;
                Log::error("[AdminTriggerBackups] Error on server #{$server->id}: " . $e->getMessage());
            }
        }

        return response()->json([
            'success'    => true,
            'message'    => "Dispatched backup for {$dispatched} server(s). Skipped {$skipped}.",
            'dispatched' => $dispatched,
            'skipped'    => $skipped,
        ]);
    }
}