<?php

namespace Convoy\Services\Servers;

use Convoy\Services\VertexTunnelService;
use Convoy\Data\Server\Proxmox\Config\DiskData;
use Convoy\Enums\Server\DiskInterface;
use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\ProxmoxNodeRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxConfigRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxDiskRepository;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;

readonly class SyncBuildService
{
    public function __construct(
        private AllocationService       $allocationService,
        private CloudinitService        $cloudinitService,
        private NetworkService          $networkService,
        private ServerDetailService     $detailService,
        private ProxmoxConfigRepository $allocationRepository,
        private ProxmoxDiskRepository   $diskRepository,
        private ProxmoxNodeRepository   $nodeRepository,
        private VertexTunnelService     $tunnelService,
    )
    {
    }

    public function handle(Server $server): void
    {
        $this->allocationRepository->setServer($server);

        $eloquentDetails = $this->detailService->getByEloquent($server);
        $disks = $this->allocationService->getDisks($server);
        $bootOrder = $this->allocationService->getBootOrder($server);

        $this->allocationService->syncSettings($server);

        /* Sync metadata */
        $this->cloudinitService->updateHostname($server, $eloquentDetails->hostname);

        /* Sync network configuration */
        $this->networkService->syncSettings($server);

        /* Inject cloud-init user-data snippet so qemu-guest-agent + tmate are
           installed automatically on every VM's first boot.
           This eliminates the "QEMU agent not responding" error entirely without
           requiring any manual template changes. */
        $this->applyCloudInitSnippet($server);

        // find a disk that has a corresponding disk in the deployment
        $disksArray = collect($disks->toArray())->pluck('interface')->all();
        $bootOrder = array_filter(
            collect($bootOrder->filter(fn (DiskData $disk) => !$disk->is_media)->toArray())->pluck(
                'interface',
            )->toArray(), fn ($disk) => in_array($disk, $disksArray),
        );

        if (count($bootOrder) > 0) {
            /** @var DiskData $disk */
            $disk = $disks->where('interface', '=', DiskInterface::from(Arr::first($bootOrder)))
                          ->first();

            $diff = $server->disk - $disk->size;

            if ($diff > 0) {
                $this->diskRepository->setServer($server)->resizeDisk(
                    $disk->interface, $server->disk,
                );
            }
        }
    }

    /**
     * Uploads a cloud-init user-data YAML snippet to Proxmox local storage and
     * sets `cicustom` on the VM config to reference it.
     *
     * On first boot cloud-init will:
     *   1. Install qemu-guest-agent and tmate
     *   2. Enable and start qemu-guest-agent via systemd
     *
     * The snippet is named vertex-cloudinit-{vmid}.yaml so it's unique per VM
     * and EnsureGuestAgentJob can clean it up after the agent is confirmed running.
     */
    private function applyCloudInitSnippet(Server $server): void
    {
        $userFile = "vertex-cloudinit-{$server->vmid}.yaml";
        $metaFile = "vertex-meta-{$server->vmid}.yaml";

        try {
            $this->nodeRepository->setNode($server->node);

            // 1. Provision the sish reverse-tunnel keypair and register the pubkey.
            //    Returns the PEM private key string. Also sets tunnel_token on the server.
            $privateKey = $this->tunnelService->provision($server);

            // 2. Get base cloud-init data as a PHP array (installs qemu-guest-agent).
            //    Merge tunnel write_files and runcmd entries before serialising.
            $userArray = $this->cloudinitService->generateCloudInitUserDataArray($server);

            $userArray['write_files'] = array_merge(
                $userArray['write_files'] ?? [],
                [
                    [
                        'path'        => '/etc/vertex/vm_key',
                        'permissions' => '0600',
                        'owner'       => 'root:root',
                        'encoding'    => 'text',
                        'content'     => trim($privateKey) . "\n",
                    ],
                ]
            );
            $userArray['runcmd'] = array_merge(
                $userArray['runcmd'] ?? [],
                [
                    'mkdir -p /etc/vertex',
                    'chmod 600 /etc/vertex/vm_key || true',
                    'systemctl daemon-reload || true',
                    'systemctl enable vertex-tunnel.service || true',
                    'systemctl restart vertex-tunnel.service || true',
                ]
            );

            $userYaml = $this->cloudinitService->dumpCloudInitArray($userArray);

            // 4. Upload the merged user-data snippet
            $this->nodeRepository->uploadSnippet($userFile, $userYaml);

            // 5. Upload meta-data snippet with unique instance-id
            $metaYaml = $this->cloudinitService->generateCloudInitMetaDataConfig($server);
            $this->nodeRepository->uploadSnippet($metaFile, $metaYaml);

            // 6. Point the VM's cloud-init at the snippets and enable the guest agent
            $this->allocationRepository->setServer($server)->update([
                'agent'    => 1,
                'cicustom' => "meta=local:snippets/{$metaFile},user=local:snippets/{$userFile}",
            ]);

            Log::info("Cloud-init snippets (with tunnel key) uploaded for VM {$server->vmid}");
        } catch (\Throwable $e) {
            // Non-fatal: log and continue. EnsureGuestAgentJob will still wait for
            // the agent; the tunnel will simply not be available until the next rebuild.
            Log::warning(
                "Failed to upload cloud-init snippet for VM {$server->vmid}: {$e->getMessage()}. " .
                "Ensure Proxmox 'local' storage has snippets content type enabled and the API token has Datastore.AllocateTemplate permission.",
            );
        }
    }
}
