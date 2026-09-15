<?php
use Convoy\Models\Node;
use Convoy\Models\Server;
use Illuminate\Support\Facades\Http;

$node = Node::find(4);

$response = Http::withOptions([
    'verify'          => $node->verify_tls,
    'timeout'         => 15,
    'connect_timeout' => 5,
])->withHeaders([
    'Authorization' => "PVEAPIToken={$node->token_id}={$node->secret}",
    'Accept'        => 'application/json',
])->get("https://{$node->fqdn}:{$node->port}/api2/json/cluster/resources", ['type' => 'vm']);

$data = $response->json('data') ?? [];
$proxmoxVmids = collect($data)->where('type', 'qemu')->pluck('vmid')->map(fn ($v) => (int) $v)->toArray();

$failedServers = Server::where('node_id', 4)
    ->whereIn('status', ['install_failed', 'installing'])
    ->get(['id', 'name', 'vmid', 'status']);

$exists = []; $notExists = [];
foreach ($failedServers as $s) {
    if (in_array((int) $s->vmid, $proxmoxVmids)) {
        $exists[] = $s;
    } else {
        $notExists[] = $s;
    }
}

echo PHP_EOL . '=== EXIST on Proxmox (fixable - just clear status) ===' . PHP_EOL;
foreach ($exists as $s) { echo "  ID:{$s->id} | {$s->name} | VMID:{$s->vmid}" . PHP_EOL; }
if (empty($exists)) { echo '  (none)' . PHP_EOL; }

echo PHP_EOL . '=== MISSING from Proxmox (customer needs reinstall) ===' . PHP_EOL;
foreach ($notExists as $s) { echo "  ID:{$s->id} | {$s->name} | VMID:{$s->vmid}" . PHP_EOL; }
if (empty($notExists)) { echo '  (none)' . PHP_EOL; }

echo PHP_EOL . 'Exist: ' . count($exists) . ' | Missing: ' . count($notExists) . PHP_EOL;
