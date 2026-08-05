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

    public function transform(Server $server)
    {
        $serverEloquentData = App::make(ServerDetailService::class)->getByEloquent($server);

        $data = $serverEloquentData->toArray();

        $data['internal_id'] = $data['id'];
        $data['id'] = $data['uuid_short'];
        unset($data['uuid_short']);

        // Calculate exact VPS Plan price for the server
        $price = 10.00;
        if (!empty($server->description) && preg_match('/Plan:\s*([^|]+)/i', $server->description, $matches)) {
            $planName = trim($matches[1]);
            $plan = \Convoy\Models\VpsPlan::where('name', $planName)->first();
            if ($plan) {
                $price = (float) $plan->price;
            }
        } else {
            $ramMb = $server->memory > 100000 ? (int) round($server->memory / (1024 * 1024)) : (int) $server->memory;
            if ($ramMb > 0) {
                $plan = \Convoy\Models\VpsPlan::where('ram', '>=', $ramMb)->orderBy('price', 'asc')->first();
                if ($plan) {
                    $price = (float) $plan->price;
                }
            }
        }
        $data['price'] = $price;

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
