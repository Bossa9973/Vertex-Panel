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

            $raw = $e->getMessage();
            if (str_contains($raw, 'cURL error 28') || str_contains(strtolower($raw), 'timed out')) {
                $detail = "Connection to Proxmox VE node {$node->name} ({$node->fqdn}:{$node->port}) timed out. Ensure the node is online and port {$node->port} is open in firewalls.";
            } elseif (str_contains($raw, '403') || str_contains(strtolower($raw), 'permission denied')) {
                $detail = "Proxmox API returned 403 Forbidden. Ensure the API token has Administrator permissions on path / with privilege separation disabled.";
            } elseif (str_contains($raw, '401') || str_contains(strtolower($raw), 'authentication failed')) {
                $detail = "Proxmox authentication failed. Please verify the node's API Token ID and Secret in Node Settings.";
            } else {
                $detail = "Failed to reset Proxmox password: " . $raw;
            }

            return response()->json([
                'errors' => [
                    [
                        'code'   => 'ProxmoxPasswordResetFailedException',
                        'status' => '500',
                        'detail' => $detail,
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

    /**
     * Toggles whether inbound VM relocations are permitted to this node.
     */
    public function toggleRelocation(Request $request, Node $node)
    {
        $current = $node->allow_relocation ?? true;
        $newVal  = $request->has('allow_relocation') ? $request->boolean('allow_relocation') : !$current;

        $node->update(['allow_relocation' => $newVal]);

        \Convoy\Facades\Activity::event('node:toggle-relocation')
            ->subject($node)
            ->property(['node_id' => $node->id, 'node_name' => $node->name, 'allow_relocation' => $newVal])
            ->log(($newVal ? 'Enabled' : 'Disabled') . " inbound VM relocations for node {$node->name}");

        return response()->json([
            'success'          => true,
            'allow_relocation' => (bool) $newVal,
            'message'          => "Inbound relocations to {$node->name} are now " . ($newVal ? 'ENABLED' : 'DISABLED') . '.',
        ]);
    }
}

