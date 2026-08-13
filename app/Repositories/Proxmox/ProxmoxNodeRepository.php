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
     * Proxmox cloud-init requires the file to live on a storage that has
     * the "snippets" content type enabled. The default "local" storage always
     * satisfies this requirement on standard Proxmox installations.
     *
     * @param  string  $filename  Snippet filename, e.g. "vertex-cloudinit-204.yaml"
     * @param  string  $yaml      Full YAML content of the cloud-init user-data file
     * @param  string  $storage   Proxmox storage name (default: "local")
     */
    public function uploadSnippet(string $filename, string $yaml, string $storage = 'local'): void
    {
        Assert::isInstanceOf($this->node, Node::class);

        // The Proxmox upload API requires multipart/form-data — do NOT send as JSON.
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
        ->attach('file', $yaml, $filename)   // multipart file field
        ->post("/api2/json/nodes/{$this->node->cluster}/storage/{$storage}/upload", [
            'content'  => 'snippets',
            'filename' => $filename,
        ]);
    }

    /**
     * Deletes a snippet file from Proxmox storage.
     *
     * Called after EnsureGuestAgentJob confirms the agent is up — the snippet
     * has been consumed by cloud-init and is no longer needed.
     *
     * @param  string  $filename  Snippet filename, e.g. "vertex-cloudinit-204.yaml"
     * @param  string  $storage   Proxmox storage name (default: "local")
     */
    public function deleteSnippet(string $filename, string $storage = 'local'): void
    {
        Assert::isInstanceOf($this->node, Node::class);

        // Volume ID format for snippets: local:snippets/filename.yaml
        $volumeId = "{$storage}:snippets/{$filename}";

        $this->getHttpClient()
            ->withUrlParameters([
                'node'     => $this->node->cluster,
                'storage'  => $storage,
                'volume'   => $volumeId,
            ])
            ->delete('/api2/json/nodes/{node}/storage/{storage}/content/{volume}');
    }
}
