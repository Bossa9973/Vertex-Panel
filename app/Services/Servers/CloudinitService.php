<?php

namespace Convoy\Services\Servers;

use Convoy\Data\Server\Deployments\CloudinitAddressConfigData;
use Convoy\Data\Server\Proxmox\Config\AddressConfigData;
use Convoy\Exceptions\Repository\Proxmox\ProxmoxConnectionException;
use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\Server\ProxmoxConfigRepository;
use Illuminate\Support\Arr;

/**
 * Class SnapshotService
 */
class CloudinitService
{
    public function __construct(private ProxmoxConfigRepository $configRepository)
    {
    }

    public function getSSHKeys(Server $server): string
    {
        $raw = collect($this->configRepository->setServer($server)->getConfig())->where('key', '=', 'sshkeys')->first()['value'] ?? '';

        return rawurldecode($raw);
    }

    /**
     * @param  string  $password
     * @param  array  $params
     * @return mixed
     */

    /**
     * @param  array  $params
     * @return mixed
     */
    public function updateHostname(Server $server, string $hostname)
    {
        $raw = collect($this->configRepository->setServer($server)->getConfig());
        $currentName = $raw->where('key', '=', 'name')->first()['value'] ?? null;
        $currentSearch = $raw->where('key', '=', 'searchdomain')->first()['value'] ?? null;

        $payload = [];
        if ($currentName !== $hostname) {
            $payload['name'] = $hostname;
        }
        if ($currentSearch !== $hostname) {
            $payload['searchdomain'] = $hostname;
        }

        if (empty($payload)) {
            return;
        }

        $this->configRepository->setServer($server)->update($payload);
    }

    public function getNameservers(Server $server)
    {
        $nameservers = collect($this->configRepository->setServer($server)->getConfig())->where('key', '=', 'nameserver')->first();

        return $nameservers ? explode(' ', $nameservers['value']) : [];
    }

    public function updateNameservers(Server $server, array $nameservers)
    {
        $payload = [
            ...(count($nameservers) > 0 ? ['nameserver' => implode(' ', $nameservers)] : []),
            ...(count($nameservers) === 0 ? ['delete' => 'nameserver'] : []),
        ];

        return $this->configRepository->setServer($server)->update($payload);
    }

    public function getIpConfig(Server $server): AddressConfigData
    {
        $rawConfig = collect($this->configRepository->setServer($server)->getConfig())->where('key', '=', 'ipconfig0')->first()['value'];

        $config = [
            'ipv4' => null,
            'ipv6' => null,
        ];

        if ($rawConfig) {
            $configs = explode(',', $rawConfig);

            Arr::map($configs, function ($value) use (&$config) {
                $property = explode('=', $value);

                if ($property[0] === 'ip') {
                    $cidr = explode('/', $property[1]);
                    $config['ipv4']['address'] = $cidr[0];
                    $config['ipv4']['cidr'] = $cidr[1];
                }
                if ($property[0] === 'ip6') {
                    $cidr = explode('/', $property[1]);
                    $config['ipv6']['address'] = $cidr[0];
                    $config['ipv6']['cidr'] = $cidr[1];
                }
                if ($property[0] === 'gw') {
                    $config['ipv4']['gateway'] = $property[1];
                }
                if ($property[0] === 'gw6') {
                    $config['ipv6']['gateway'] = $property[1];
                }
            });
        }

        return AddressConfigData::from($config);
    }

    /**
     * @param  string|array  $config
     * @return mixed|void
     *
     * @throws ProxmoxConnectionException
     */
    public function updateIpConfig(Server $server, CloudinitAddressConfigData $addresses)
    {
        $payload = [];

        if ($addresses?->ipv4) {
            $ipv4 = $addresses->ipv4;
            $payload[] = "ip={$ipv4->address}/{$ipv4->cidr}";
            $payload[] = 'gw='.$ipv4->gateway;
        }

        if ($addresses?->ipv6) {
            $ipv6 = $addresses->ipv6;
            $payload[] = "ip6={$ipv6->address}/{$ipv6->cidr}";
            $payload[] = 'gw6='.$ipv6->gateway;
        }

        $desired = Arr::join($payload, ',');
        $current = collect($this->configRepository->setServer($server)->getConfig())
            ->where('key', '=', 'ipconfig0')->first()['value'] ?? '';

        if ($current === $desired) {
            return;
        }

        if ($desired === '') {
            return $this->configRepository->setServer($server)->update(['delete' => 'ipconfig0']);
        }

        return $this->configRepository->setServer($server)->update(['ipconfig0' => $desired]);
    }

    /**
     * Generate cloud-init user-data that installs and enables qemu-guest-agent.
     * Tmate has been replaced by the sish reverse-tunnel system (vertex-tunnel.service
     * is baked into template 1002; the private key is injected per-VM via a separate
     * cicustom snippet written by VertexTunnelService::provision()).
     */
    public function generateCloudInitUserDataConfig(Server $server): string
    {
        return $this->dumpCloudInitArray(
            $this->generateCloudInitUserDataArray($server)
        );
    }

    /**
     * Returns the cloud-init user-data as a plain PHP array so callers can
     * merge additional keys (write_files, runcmd, etc.) before serialising —
     * avoiding the duplicate-key YAML problem entirely.
     */
    public function generateCloudInitUserDataArray(Server $server): array
    {
        $config = collect($this->configRepository->setServer($server)->getConfig());
        $user = $config->where('key', '=', 'ciuser')->first()['value'] ?? 'root';
        $rawPassword = $config->where('key', '=', 'cipassword')->first()['value'] ?? null;
        $sshKeysRaw = $config->where('key', '=', 'sshkeys')->first()['value'] ?? null;
        $sshKey = $sshKeysRaw ? rawurldecode($sshKeysRaw) : null;

        $data = [
            'package_update'  => true,
            'package_upgrade' => false,
            'packages'        => ['qemu-guest-agent'],
            'bootcmd'         => [
                ['sh', '-c', 'systemctl start qemu-guest-agent || true'],
            ],
        ];

        if ($user) {
            $data['user'] = $user;
        }

        if ($rawPassword) {
            $data['password']  = $rawPassword;
            $data['chpasswd']  = ['expire' => false];
            $data['ssh_pwauth'] = true;
        }

        if ($sshKey) {
            $data['ssh_authorized_keys'] = [$sshKey];
        }

        $data['runcmd'] = [
            'systemctl daemon-reload || true',
            'systemctl enable qemu-guest-agent || true',
            'systemctl start qemu-guest-agent || true',
            'service qemu-guest-agent start || true',
            '/etc/init.d/qemu-guest-agent start || true',
        ];

        return $data;
    }

    /**
     * Serialises a cloud-init data array into a #cloud-config YAML string.
     *
     * Handles the cloud-init-relevant scalar types, lists of scalars,
     * lists of mappings (write_files), and nested mappings (chpasswd).
     * Does NOT aim to be a general-purpose YAML serialiser — only the
     * keys that generateCloudInitUserDataArray() (and callers) actually use.
     */
    public function dumpCloudInitArray(array $data): string
    {
        $yaml = "#cloud-config\n";

        foreach ($data as $key => $value) {
            $yaml .= $this->dumpCloudInitValue($key, $value, 0);
        }

        return $yaml;
    }

    private function dumpCloudInitValue(string $key, mixed $value, int $indent): string
    {
        $pad = str_repeat(' ', $indent);

        if (is_bool($value)) {
            return "{$pad}{$key}: " . ($value ? 'true' : 'false') . "\n";
        }

        if (is_int($value) || is_float($value)) {
            return "{$pad}{$key}: {$value}\n";
        }

        if (is_string($value)) {
            if (str_contains($value, "\n")) {
                $out = "{$pad}{$key}: |\n";
                foreach (explode("\n", rtrim($value)) as $line) {
                    $out .= "{$pad}  {$line}\n";
                }
                return $out;
            }
            $needsQuoting = preg_match('/[:\[\]{},#&*!|>\'"%@`]|^(true|false|null|yes|no)$/i', $value);
            $escaped = str_replace('"', '\\"', $value);
            return $needsQuoting ? "{$pad}{$key}: \"{$escaped}\"\n" : "{$pad}{$key}: {$value}\n";
        }

        if (is_array($value)) {
            $isAssoc = array_keys($value) !== range(0, count($value) - 1);
            if ($isAssoc) {
                $out = "{$pad}{$key}:\n";
                foreach ($value as $k => $v) {
                    $out .= $this->dumpCloudInitValue((string) $k, $v, $indent + 2);
                }
                return $out;
            }

            $out = "{$pad}{$key}:\n";
            foreach ($value as $item) {
                if (! is_array($item)) {
                    // Scalar list item (runcmd lines, package names, etc.)
                    $escaped = is_string($item) ? str_replace('"', '\\"', $item) : $item;
                    $needsQ  = is_string($item) && preg_match('/[:\[\]{},#&*!|>\'"%@`]|^(true|false|null|yes|no)$/i', $item);
                    $out    .= $needsQ ? "{$pad}  - \"{$escaped}\"\n" : "{$pad}  - {$item}\n";
                    continue;
                }

                $itemKeys = array_keys($item);

                // Sequence-of-sequences — e.g. bootcmd: [['sh', '-c', 'cmd']]
                if ($itemKeys === range(0, count($item) - 1)) {
                    $encoded = implode(', ', array_map(fn ($s) => "\"{$s}\"", $item));
                    $out .= "{$pad}  - [{$encoded}]\n";
                    continue;
                }

                // Sequence-of-mappings — e.g. write_files items
                $firstKey = $itemKeys[0];
                $firstVal = $item[$firstKey];
                $restKeys = array_slice($itemKeys, 1);

                if (is_string($firstVal) && str_contains($firstVal, "\n")) {
                    // Literal block scalar — e.g. multi-line private key
                    $out .= "{$pad}  - {$firstKey}: |\n";
                    foreach (explode("\n", rtrim($firstVal)) as $line) {
                        $out .= "{$pad}    {$line}\n";
                    }
                } else {
                    $scalarLine = $this->dumpCloudInitValue($firstKey, $firstVal, 0);
                    $out .= "{$pad}  - " . ltrim($scalarLine);
                }

                foreach ($restKeys as $k) {
                    $out .= $this->dumpCloudInitValue($k, $item[$k], $indent + 4);
                }
            }
            return $out;
        }

        return '';
    }

    /**
     * Generates cloud-init meta-data with a unique instance-id.
     * Changing the instance-id forces cloud-init to re-run on existing/already-deployed VMs!
     */
    public function generateCloudInitMetaDataConfig(Server $server): string
    {
        $instanceId = "vertex-vm-{$server->vmid}-" . now()->timestamp;
        $hostname = $server->hostname ?: "vm-{$server->vmid}";

        return "instance-id: {$instanceId}\nlocal-hostname: {$hostname}\n";
    }
}
