<?php

namespace Convoy\Repositories\Proxmox;

use Convoy\Models\Node;
use Convoy\Exceptions\Repository\Proxmox\ProxmoxConnectionException;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Webmozart\Assert\Assert;

/**
 * Node-level Proxmox repository — operates on the node itself, not on a specific VM.
 * Handles snippet uploads, node-level storage management, etc.
 */
class ProxmoxNodeRepository
{
    protected Node $node;

    public function __construct(private Application $app)
    {
    }

    public function setNode(Node $node): static
    {
        $this->node = $node;

        return $this;
    }

    /**
     * Returns a pre-configured HTTP client for JSON requests to the Proxmox API.
     */
    protected function getHttpClient(array $headers = [], array $options = []): \Illuminate\Http\Client\PendingRequest
    {
        Assert::isInstanceOf($this->node, Node::class);

        return Http::withOptions(array_merge([
            'verify'          => $this->node->verify_tls,
            'base_uri'        => "https://{$this->node->fqdn}:{$this->node->port}/",
            'timeout'         => config('convoy.guzzle.timeout'),
            'connect_timeout' => config('convoy.guzzle.connect_timeout'),
            'headers'         => array_merge([
                'Authorization' => "PVEAPIToken={$this->node->token_id}={$this->node->secret}",
                'Accept'        => 'application/json',
            ], $headers),
        ], $options))->throw(function (Response $response, RequestException $exception) {
            throw new ProxmoxConnectionException($response, $exception);
        });
    }

    /**
     * Uploads a cloud-init user-data YAML file to Proxmox storage as a snippet.
     *
     * @param  string  $filename  Snippet filename, e.g. "vertex-cloudinit-204.yaml"
     * @param  string  $yaml      Full YAML content of the cloud-init user-data file
     * @param  string  $storage   Proxmox storage name (default: "local")
     */
    public function uploadSnippet(string $filename, string $yaml, string $storage = 'local'): void
    {
        Assert::isInstanceOf($this->node, Node::class);

        // Auto-discover storages that have 'snippets' enabled
        $storages = [$storage];
        try {
            $nodeStorages = $this->getHttpClient()
                ->withUrlParameters(['node' => $this->node->cluster])
                ->get('/api2/json/nodes/{node}/storage')
                ->json();

            $data = $nodeStorages['data'] ?? [];
            foreach ($data as $st) {
                $content = $st['content'] ?? '';
                if (str_contains($content, 'snippets') && !empty($st['storage'])) {
                    $storages[] = $st['storage'];
                }
            }
        } catch (\Throwable) {}

        // Fallbacks
        $storages = array_unique(array_merge($storages, ['local', $this->node->iso_storage ?? 'local']));
        $lastException = null;

        foreach ($storages as $targetStorage) {
            try {
                // Proxmox storage upload requires multipart/form-data with field name 'filename'
                Http::withOptions([
                    'verify'          => $this->node->verify_tls,
                    'base_uri'        => "https://{$this->node->fqdn}:{$this->node->port}/",
                    'timeout'         => 30,
                    'connect_timeout' => config('convoy.guzzle.connect_timeout'),
                ])
                ->withHeaders([
                    'Authorization' => "PVEAPIToken={$this->node->token_id}={$this->node->secret}",
                    'Accept'        => 'application/json',
                ])
                ->throw(function (Response $response, RequestException $exception) {
                    throw new ProxmoxConnectionException($response, $exception);
                })
                ->attach('filename', $yaml, $filename)
                ->post("/api2/json/nodes/{$this->node->cluster}/storage/{$targetStorage}/upload", [
                    'content' => 'snippets',
                ]);

                return;
            } catch (\Throwable $e) {
                $lastException = $e;
                \Illuminate\Support\Facades\Log::debug("uploadSnippet attempt failed on {$targetStorage}: {$e->getMessage()}");
            }
        }

        if ($lastException) {
            throw $lastException;
        }
    }

    /**
     * Regenerate the cloud-init drive for a VM.
     *
     * CRITICAL for cloned VMs: Proxmox carries the template's cloud-init state
     * forward when cloning. Simply setting cicustom via the config API does NOT
     * cause the new snippet to be used — you MUST explicitly regenerate the
     * cloud-init ISO after updating cicustom, otherwise the VM boots with the
     * template's old (or empty) cloud-init configuration.
     *
     * Proxmox API: PUT /api2/json/nodes/{node}/qemu/{vmid}/cloudinit
     *
     * @param  string  $nodeName  The Proxmox node cluster name (e.g. "pve")
     * @param  int     $vmid      The VM ID to regenerate cloud-init for
     */
    public function regenerateCloudInit(string $nodeName, int $vmid): void
    {
        Assert::isInstanceOf($this->node, Node::class);

        $this->getHttpClient()
            ->put("/api2/json/nodes/{$nodeName}/qemu/{$vmid}/cloudinit")
            ->json();
    }
}

