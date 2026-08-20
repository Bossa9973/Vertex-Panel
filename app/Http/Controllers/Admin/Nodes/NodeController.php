<?php

namespace Convoy\Http\Controllers\Admin\Nodes;

use Convoy\Http\Controllers\ApiController;
use Convoy\Http\Requests\Admin\Nodes\StoreNodeRequest;
use Convoy\Http\Requests\Admin\Nodes\UpdateNodeRequest;
use Convoy\Models\Filters\FiltersNodeWildcard;
use Convoy\Models\Node;
use Convoy\Transformers\Admin\NodeTransformer;
use Illuminate\Http\Request;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

class NodeController extends ApiController
{
    public function index(Request $request)
    {
        $nodes = QueryBuilder::for(Node::query())
                             ->withCount(['servers'])
                             ->allowedFilters(
                                 [AllowedFilter::exact('id'), 'name', 'fqdn', AllowedFilter::exact(
                                     'location_id',
                                 ), AllowedFilter::exact(
                                     'coterm_id',
                                 )->nullable(), AllowedFilter::custom(
                                     '*',
                                     new FiltersNodeWildcard(),
                                 )],
                             )
                             ->paginate(min($request->query('per_page', 50), 100))->appends(
                $request->query(),
            );

        return fractal($nodes, new NodeTransformer())->respond();
    }

    public function show(Node $node)
    {
        $node->append(['memory_allocated', 'disk_allocated']);

        $node->loadCount('servers');

        return fractal($node, new NodeTransformer())->respond();
    }

    public function store(StoreNodeRequest $request)
    {
        $node = Node::create($request->validated());

        return fractal($node, new NodeTransformer())->respond();
    }

    public function update(UpdateNodeRequest $request, Node $node)
    {
        $node->update($request->validated());

        return fractal($node, new NodeTransformer())->respond();
    }

    public function destroy(Node $node)
    {
        $node->loadCount('servers');

        if ($node->servers_count > 0) {
            throw new AccessDeniedHttpException(
                'This node cannot be deleted with servers still associated.',
            );
        }

        $node->delete();

        return $this->returnNoContent();
    }

    /**
     * Resets the Proxmox VE root (or specified user) password using the Proxmox Access API.
     */
    public function resetRootPassword(
        Request $request,
        Node $node,
        \Convoy\Repositories\Proxmox\Node\ProxmoxAccessRepository $accessRepository
    ) {
        $request->validate([
            'password' => 'required|string|min:6|max:128',
            'userid'   => 'sometimes|nullable|string|max:64',
        ]);

        $userid = $request->input('userid') ?: 'root@pam';
        if (!str_contains($userid, '@')) {
            $userid .= '@pam';
        }

        try {
            $accessRepository->setNode($node)->updatePassword(
                $userid,
                $request->input('password')
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Failed to reset PVE password for {$userid} on node #{$node->id} ({$node->name}): {$e->getMessage()}");

            return response()->json([
                'errors' => [
                    [
                        'code'   => 'ProxmoxPasswordResetFailedException',
                        'status' => '500',
                        'detail' => 'Failed to reset Proxmox password: ' . $e->getMessage(),
                    ]
                ]
            ], 500);
        }

        \Convoy\Facades\Activity::event('node:reset-root-password')
            ->subject($node)
            ->property(['node_id' => $node->id, 'node_name' => $node->name, 'userid' => $userid])
            ->log("Reset PVE password for {$userid} on node {$node->name}");

        return response()->json([
            'success' => true,
            'message' => "Successfully updated PVE password for {$userid} on {$node->name}.",
        ]);
    }
}

