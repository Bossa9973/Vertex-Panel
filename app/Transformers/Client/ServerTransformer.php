<?php

namespace Convoy\Transformers\Client;

use Convoy\Models\Server;
use Illuminate\Support\Facades\App;
use League\Fractal\TransformerAbstract;
use Convoy\Transformers\Admin\NodeTransformer;
use Convoy\Transformers\Admin\UserTransformer;
use Convoy\Services\Servers\ServerDetailService;

class ServerTransformer extends TransformerAbstract
{
    protected array $availableIncludes = [
        'user',
        'node',
    ];

    private static ?\Illuminate\Database\Eloquent\Collection $cachedPlans = null;

    private function getPlans()
    {
        if (static::$cachedPlans === null) {
            static::$cachedPlans = \Illuminate\Support\Facades\Cache::remember('vps_plans_cached_list', 300, function () {
                return \Convoy\Models\VpsPlan::orderBy('price', 'asc')->get();
            });
        }
        return static::$cachedPlans;
    }

    public function transform(Server $server)
    {
        $serverEloquentData = App::make(ServerDetailService::class)->getByEloquent($server);

        $data = $serverEloquentData->toArray();

        $data['internal_id'] = $data['id'];
        $data['id'] = $data['uuid_short'];
        unset($data['uuid_short']);

        // Attach eager-loaded node details if available
        if ($server->relationLoaded('node') && $server->node) {
            $data['node'] = [
                'id' => $server->node->id,
                'name' => $server->node->name,
                'location_name' => $server->node->location_name ?? $server->node->name,
                'fqdn' => $server->node->fqdn,
                'flag' => $server->node->flag ?? null,
            ];
        }

        // Calculate exact VPS Plan price for the server from cached plans (zero extra SQL queries)
        $price = 10.00;
        $plans = $this->getPlans();
        if (!empty($server->description) && preg_match('/Plan:\s*([^|]+)/i', $server->description, $matches)) {
            $planName = trim($matches[1]);
            $plan = $plans->first(fn($p) => strcasecmp($p->name, $planName) === 0);
            if ($plan) {
                $price = (float) $plan->price;
            }
        } else {
            $ramMb = $server->memory > 100000 ? (int) round($server->memory / (1024 * 1024)) : (int) $server->memory;
            if ($ramMb > 0) {
                $plan = $plans->first(fn($p) => $p->ram >= $ramMb);
                if ($plan) {
                    $price = (float) $plan->price;
                }
            }
        }
        $data['price'] = $price;
        $nowTs = \Carbon\Carbon::now()->getTimestamp();
        $data['activity_remaining_seconds'] = $server->activity_expires_at
            ? (int) max(0, \Carbon\Carbon::parse($server->activity_expires_at)->getTimestamp() - $nowTs)
            : null;
        $data['deletion_remaining_seconds'] = $server->deletion_deadline_at
            ? (int) max(0, \Carbon\Carbon::parse($server->deletion_deadline_at)->getTimestamp() - $nowTs)
            : null;
        $data['reactivation_progress'] = $server->getReactivationProgress();

        return $data;
    }

    public function includeUser(Server $server)
    {
        return $this->item($server->user, new UserTransformer);
    }

    public function includeNode(Server $server)
    {
        return $this->item($server->node, new NodeTransformer);
    }
}
