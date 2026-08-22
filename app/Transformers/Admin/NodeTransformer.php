<?php

namespace Convoy\Transformers\Admin;

use Convoy\Models\Node;
use League\Fractal\TransformerAbstract;

class NodeTransformer extends TransformerAbstract
{
    public function transform(Node $node): array
    {
        $locCode = $node->location ? strtoupper($node->location->short_code) : 'DE';
        $flag = 'https://flagcdn.com/de.svg';
        if (\Illuminate\Support\Str::contains(strtolower($locCode), 'us')) {
            $flag = 'https://flagcdn.com/us.svg';
        } elseif (\Illuminate\Support\Str::contains(strtolower($locCode), ['uk', 'gb'])) {
            $flag = 'https://flagcdn.com/gb.svg';
        } elseif (\Illuminate\Support\Str::contains(strtolower($locCode), 'jp')) {
            $flag = 'https://flagcdn.com/jp.svg';
        } elseif (\Illuminate\Support\Str::contains(strtolower($locCode), 'sg')) {
            $flag = 'https://flagcdn.com/sg.svg';
        } elseif (\Illuminate\Support\Str::contains(strtolower($locCode), 'au')) {
            $flag = 'https://flagcdn.com/au.svg';
        }

        return [
            'id' => $node->id,
            'location_id' => $node->location_id,
            'name' => $node->name,
            'cluster' => $node->cluster,
            'verify_tls' => $node->verify_tls,
            'hidden' => (bool) $node->hidden,
            'fqdn' => $node->fqdn,
            'port' => $node->port,
            'memory' => $node->memory,
            'memory_overallocate' => $node->memory_overallocate,
            'memory_allocated' => $node->memory_allocated,
            'disk' => $node->disk,
            'disk_overallocate' => $node->disk_overallocate,
            'disk_allocated' => $node->disk_allocated,
            'vm_storage' => $node->vm_storage,
            'backup_storage' => $node->backup_storage,
            'iso_storage' => $node->iso_storage,
            'network' => $node->network,
            'coterm_id' => $node->coterm_id,
            'servers_count' => (int)$node->servers_count,
            'flag' => $flag,
            'location_code' => $locCode,
            'location_name' => $node->location ? $node->location->description : $node->name,
        ];
    }
}
