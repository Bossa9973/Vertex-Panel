<?php

namespace Convoy\Services\Servers;

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

            // 1. Upload user-data snippet
            $userYaml = $this->cloudinitService->generateCloudInitUserDataConfig($server);
            $this->nodeRepository->uploadSnippet($userFile, $userYaml);

            // 2. Upload meta-data snippet with unique instance-id
            $metaYaml = $this->cloudinitService->generateCloudInitMetaDataConfig($server);
            $this->nodeRepository->uploadSnippet($metaFile, $metaYaml);

            // Point the VM's cloud-init at the uploaded snippets and enable agent: 1
            $this->allocationRepository->setServer($server)->update([
                'agent' => 1,
                'cicustom' => "meta=local:snippets/{$metaFile},user=local:snippets/{$userFile}",
            ]);

            Log::info("Cloud-init meta & user snippets uploaded for VM {$server->vmid}");
        } catch (\Throwable $e) {
            // Non-fatal: if snippet upload fails (e.g. storage doesn't support snippets,
            // or API token lacks permission), log a warning and continue.
            // EnsureGuestAgentJob will still wait for the agent; it will just take longer
            // if qemu-guest-agent isn't pre-installed in the template.
            Log::warning(
                "Failed to upload cloud-init snippet for VM {$server->vmid}: {$e->getMessage()}. " .
                "Ensure Proxmox 'local' storage has snippets content type enabled and the API token has Datastore.AllocateTemplate permission.",
            );
        }
    }
}
