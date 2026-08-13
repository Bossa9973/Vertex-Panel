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
     * Generate complete cloud-init user-data configuration with pre-installed
     * qemu-guest-agent, tmate, user authentication and instant daemon activation.
     */
    public function generateCloudInitUserDataConfig(Server $server): string
    {
        $config = collect($this->configRepository->setServer($server)->getConfig());
        $user = $config->where('key', '=', 'ciuser')->first()['value'] ?? 'root';
        $rawPassword = $config->where('key', '=', 'cipassword')->first()['value'] ?? null;
        $sshKeysRaw = $config->where('key', '=', 'sshkeys')->first()['value'] ?? null;
        $sshKey = $sshKeysRaw ? rawurldecode($sshKeysRaw) : null;

        $yaml = "#cloud-config\n";
        $yaml .= "package_update: true\n";
        $yaml .= "package_upgrade: false\n";
        $yaml .= "packages:\n";
        $yaml .= "  - qemu-guest-agent\n";
        $yaml .= "  - curl\n";
        $yaml .= "  - tmate\n";
        $yaml .= "\n";

        if ($user) {
            $yaml .= "user: {$user}\n";
        }

        if ($rawPassword) {
            $yaml .= "password: {$rawPassword}\n";
            $yaml .= "chpasswd: { expire: false }\n";
            $yaml .= "ssh_pwauth: true\n";
        }

        if ($sshKey) {
            $yaml .= "ssh_authorized_keys:\n";
            $yaml .= "  - \"{$sshKey}\"\n";
        }

        $yaml .= "\nruncmd:\n";
        $yaml .= "  - systemctl daemon-reload || true\n";
        $yaml .= "  - systemctl enable --now qemu-guest-agent || true\n";
        $yaml .= "  - systemctl start qemu-guest-agent || true\n";
        $yaml .= "  - service qemu-guest-agent start || true\n";
        $yaml .= "  - /etc/init.d/qemu-guest-agent start || true\n";
        $yaml .= "  - tmate -S /tmp/tmate.sock new-session -d 2>/dev/null || true\n";

        return $yaml;
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
