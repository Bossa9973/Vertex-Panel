<?php

namespace Convoy\Services\Backups;

use Convoy\Models\Backup;
use Convoy\Models\Node;
use phpseclib3\Crypt\PublicKeyLoader;
use Throwable;

/**
 * Diagnostic service for node SSH/SFTP connectivity, credentials, and cloud uploads.
 */
class BackupUploadDiagnosticService
{
    /**
     * Diagnose SSH/network connectivity and configuration for a given Node.
     */
    public function diagnoseNode(Node $node): array
    {
        $sshHost     = !empty($node->ssh_host) ? trim($node->ssh_host) : trim($node->fqdn ?? '');
        $sshPort     = (int) ($node->ssh_port ?: 22);
        $sshUsername = !empty($node->ssh_username) ? trim($node->ssh_username) : 'root';
        $rawKey      = trim($node->ssh_private_key ?? '');

        $report = [
            'node_id'            => $node->id,
            'node_name'          => $node->name,
            'ssh_host'           => $sshHost,
            'ssh_port'           => $sshPort,
            'ssh_username'       => $sshUsername,
            'resolved_ip'        => null,
            'is_cloudflare'      => false,
            'key_status'         => 'unknown',
            'key_error'          => null,
            'socket_status'      => 'unknown',
            'socket_error'       => null,
            'banner'             => null,
            'detected_service'   => 'unknown',
            'probable_cause'     => null,
            'recommendations'    => [],
        ];

        // 1. Host validation & DNS resolution
        if (empty($sshHost)) {
            $report['socket_status']   = 'missing_host';
            $report['probable_cause']  = "Node #{$node->id} has no 'ssh_host' or 'fqdn' configured.";
            $report['recommendations'][] = "Go to Admin -> Nodes -> {$node->name} -> SSH Settings and enter a valid IP address or hostname in 'SSH Host'.";
            return $report;
        }

        $resolvedIp = filter_var($sshHost, FILTER_VALIDATE_IP) ? $sshHost : @gethostbyname($sshHost);
        $report['resolved_ip'] = ($resolvedIp !== $sshHost && filter_var($resolvedIp, FILTER_VALIDATE_IP)) ? $resolvedIp : ($resolvedIp === $sshHost ? $sshHost : null);

        if ($report['resolved_ip'] && $this->isCloudflareIp($report['resolved_ip'])) {
            $report['is_cloudflare'] = true;
            $report['probable_cause'] = "Hostname '{$sshHost}' resolves to Cloudflare Proxy IP ({$report['resolved_ip']}). Cloudflare HTTP proxy does not support raw SFTP/SSH traffic and terminates the connection.";
            $report['recommendations'][] = "Change 'SSH Host' in Node Settings from '{$sshHost}' to your server's direct origin IP address (e.g. your Proxmox server's public IPv4).";
        }

        // 2. Private Key validation
        if (empty($rawKey)) {
            $report['key_status'] = 'missing';
            $report['key_error']  = 'No SSH private key configured for this node.';
            $report['recommendations'][] = "Paste your OpenSSH private key (e.g., contents of id_rsa or id_ed25519) into Node -> SSH Settings -> SSH Private Key.";
        } else {
            // Check if file path
            if (file_exists($rawKey) && is_readable($rawKey)) {
                $rawKey = file_get_contents($rawKey);
            }
            $normalizedKey = $this->normalizePrivateKey($rawKey);

            try {
                $loadedKey = PublicKeyLoader::load($normalizedKey);
                $report['key_status'] = 'valid';
            } catch (Throwable $ke) {
                $report['key_status'] = 'invalid';
                $report['key_error']  = $ke->getMessage();
                $report['recommendations'][] = "SSH Private Key could not be parsed: {$ke->getMessage()}. Ensure the key is unencrypted (no passphrase) and in standard PEM/OpenSSH format (starts with '-----BEGIN ... PRIVATE KEY-----').";
            }
        }

        // 3. Socket probe
        $socket = @fsockopen($sshHost, $sshPort, $errno, $errstr, 4);
        if (!$socket) {
            $report['socket_status'] = 'failed';
            $report['socket_error']  = "Cannot connect to {$sshHost}:{$sshPort} - {$errstr} (Error #{$errno})";

            if ($errno === 111 || str_contains(strtolower($errstr), 'refused')) {
                $report['probable_cause'] = "Connection refused on {$sshHost}:{$sshPort}. Nothing is listening on port {$sshPort}, or a firewall is actively rejecting the connection.";
                $report['recommendations'][] = "Verify if OpenSSH is running and listening on port {$sshPort} on the remote node (`systemctl status ssh` / `netstat -tlpn | grep ssh`).";
            } elseif ($errno === 110 || str_contains(strtolower($errstr), 'timed out')) {
                $report['probable_cause'] = "Connection timed out connecting to {$sshHost}:{$sshPort}. A firewall (Proxmox firewall, ufw, cloud security group) is dropping packets.";
                $report['recommendations'][] = "Allow incoming TCP connections on port {$sshPort} in your server firewall / cloud provider security groups.";
            } else {
                $report['probable_cause'] = "Network error: {$errstr} (code {$errno})";
                $report['recommendations'][] = "Check network connectivity and routing between the Vertex Panel server and {$sshHost}.";
            }
        } else {
            $report['socket_status'] = 'connected';
            stream_set_timeout($socket, 3);
            $banner = @fread($socket, 512);
            @fclose($socket);

            $bannerTrimmed = trim($banner ?: '');
            $report['banner'] = !empty($bannerTrimmed) ? substr($bannerTrimmed, 0, 120) : null;

            if (!empty($bannerTrimmed) && str_starts_with($bannerTrimmed, 'SSH-')) {
                $report['detected_service'] = 'ssh';
            } elseif (!empty($bannerTrimmed) && (str_contains($bannerTrimmed, 'HTTP/') || str_contains($bannerTrimmed, '<html') || str_contains($bannerTrimmed, '400 Bad Request') || str_contains($bannerTrimmed, '403 Forbidden'))) {
                $report['detected_service'] = 'http';
                $report['probable_cause'] = "Port {$sshPort} on {$sshHost} returned an HTTP response instead of an OpenSSH banner: \"{$report['banner']}\".";
                $report['recommendations'][] = "Port {$sshPort} is serving HTTP/Web traffic (like Nginx, Caddy, or Proxmox GUI on 8006/443). Change 'SSH Port' in Node Settings to your actual OpenSSH port (usually 22).";
            } elseif (empty($bannerTrimmed)) {
                $report['detected_service'] = 'closed_immediately';
                if ($sshPort === 443 || $sshPort === 8006 || $sshPort === 8443) {
                    $report['probable_cause'] = "Port {$sshPort} accepted TCP connection but closed immediately without sending an SSH banner. Port {$sshPort} is likely an HTTPS/TLS web port or behind a reverse proxy/Cloudflare.";
                    $report['recommendations'][] = "Port {$sshPort} is likely expecting TLS/HTTPS rather than raw SSH. If this is a domain name, use the server's direct IP. If OpenSSH is not on port {$sshPort}, change 'SSH Port' to 22.";
                } else {
                    $report['probable_cause'] = "The remote host {$sshHost}:{$sshPort} closed the connection immediately before the SSH identification banner was sent.";
                    $report['recommendations'][] = "Check if Fail2ban, `/etc/hosts.deny`, or sshd `MaxStartups` rate-limiting on the node is dropping incoming connections.";
                }
            } else {
                $report['detected_service'] = 'unknown';
                $report['probable_cause'] = "Unexpected response from {$sshHost}:{$sshPort}: \"{$report['banner']}\".";
                $report['recommendations'][] = "Verify that an OpenSSH daemon is listening on {$sshHost}:{$sshPort}.";
            }
        }

        return $report;
    }

    /**
     * Diagnose an exception thrown during backup streaming / upload.
     */
    public function diagnoseFailure(Throwable $e, Backup $backup, ?Node $node = null): array
    {
        $node = $node ?? $backup->server?->node;
        $msg  = $e->getMessage();
        $cls  = get_class($e);

        $sshHost     = $node ? (!empty($node->ssh_host) ? $node->ssh_host : $node->fqdn) : 'unknown';
        $sshPort     = $node ? ($node->ssh_port ?: 22) : 22;
        $sshUsername = $node ? (!empty($node->ssh_username) ? $node->ssh_username : 'root') : 'root';
        $remotePath  = $node ? (rtrim($node->getBackupBasePath(), '/') . '/' . ($backup->file_name ?? 'unknown')) : 'unknown';

        $nodeReport = $node ? $this->diagnoseNode($node) : null;

        $diagnosis = [
            'category'        => 'General Upload Failure',
            'title'           => 'Backup Upload Failed',
            'exception_class' => $cls,
            'raw_message'     => $msg,
            'node_id'         => $node?->id,
            'node_name'       => $node?->name,
            'target'          => "{$sshUsername}@{$sshHost}:{$sshPort}",
            'backup_id'       => $backup->id,
            'server_id'       => $backup->server_id,
            'server_hostname' => $backup->server?->hostname,
            'file_name'       => $backup->file_name,
            'remote_path'     => $remotePath,
            'what_happened'   => [],
            'recommendations' => [],
        ];

        // 1. Connection closed / non-SSH server error
        if (str_contains($msg, "Connection closed by server; are you sure you're connected to an SSH server")
            || str_contains($msg, "Unable to connect to")
            || str_contains($msg, "Cannot connect to")
            || str_contains($cls, "ConnectionClosedException")) {

            $diagnosis['category'] = 'SSH / Network Protocol Conflict';
            $diagnosis['title']    = "Connection Dropped or Non-SSH Service Detected ({$sshHost}:{$sshPort})";

            if ($nodeReport && $nodeReport['is_cloudflare']) {
                $diagnosis['what_happened'][] = "The host '{$sshHost}' is resolving to a Cloudflare Proxy IP ({$nodeReport['resolved_ip']}). Cloudflare HTTP proxy drops raw SFTP/SSH connections.";
                $diagnosis['recommendations'][] = "Go to Admin -> Nodes -> {$node->name} -> SSH Settings.";
                $diagnosis['recommendations'][] = "Set 'SSH Host' to your server's Direct Public IPv4 address (not the Cloudflare proxied domain).";
            } elseif ($sshPort === 443 || $sshPort === 8006 || $sshPort === 80 || $sshPort === 8443) {
                $diagnosis['what_happened'][] = "Port {$sshPort} is typically an HTTP/HTTPS web port (e.g. Proxmox GUI on 8006 or web proxy on 443). phpseclib attempted to start an SFTP/SSH session, but the remote service rejected or closed it.";
                $diagnosis['what_happened'][] = $nodeReport['probable_cause'] ?? "The port responded with non-SSH data or closed immediately.";
                $diagnosis['recommendations'][] = "Change 'SSH Port' to your node's OpenSSH port (usually 22, unless you specifically configured sshd on another port).";
                $diagnosis['recommendations'][] = "Ensure 'SSH Host' is the direct server IP address.";
            } else {
                $diagnosis['what_happened'][] = "The SSH connection to {$sshHost}:{$sshPort} was terminated by the remote host during initial handshake.";
                if ($nodeReport && $nodeReport['probable_cause']) {
                    $diagnosis['what_happened'][] = $nodeReport['probable_cause'];
                }
                $diagnosis['recommendations'][] = "Verify that OpenSSH is running on port {$sshPort} on the remote node (`systemctl status ssh`).";
                $diagnosis['recommendations'][] = "Check if Fail2ban or iptables blocked this panel's IP address on the remote node.";
            }
            return $diagnosis;
        }

        // 2. Authentication failure
        if (str_contains($msg, "SFTP authentication failed")
            || str_contains($msg, "publickey")
            || str_contains($msg, "authentication failed")
            || str_contains($msg, "Unable to authenticate")) {

            $diagnosis['category'] = 'SSH Authentication Failure';
            $diagnosis['title']    = "SSH Key Rejected by Node ({$sshUsername}@{$sshHost})";
            $diagnosis['what_happened'][] = "The node accepted the network connection on port {$sshPort}, but rejected authentication for user '{$sshUsername}'.";
            $diagnosis['what_happened'][] = "The SSH private key configured in the panel does not match any authorized public key on the node.";
            $diagnosis['recommendations'][] = "Verify that the public key corresponding to your private key is pasted into `/root/.ssh/authorized_keys` on the node.";
            $diagnosis['recommendations'][] = "Check permissions on the node: `chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys`.";
            $diagnosis['recommendations'][] = "Ensure 'SSH Username' is set to 'root' (or a user with read access to backup directories).";
            return $diagnosis;
        }

        // 3. Remote file not found
        if (str_contains($msg, "Backup file not found on node")) {
            $diagnosis['category'] = 'Remote File Not Found';
            $diagnosis['title']    = "Backup Archive File Missing on Node";
            $diagnosis['what_happened'][] = "Connected via SFTP successfully, but the archive file '{$backup->file_name}' was not found at '{$remotePath}'.";
            $diagnosis['what_happened'][] = "Proxmox may have saved the backup to a different storage directory or storage pool.";
            $diagnosis['recommendations'][] = "Check on the Proxmox node where backups are stored (`ls -la /var/lib/vz/dump` or `/mnt/pve/...`).";
            $diagnosis['recommendations'][] = "In Admin -> Nodes -> {$node->name} -> SSH Settings, set 'Backup Path' to the correct directory where Proxmox saves `.vma.zst` files.";
            return $diagnosis;
        }

        // 4. Google Drive / Flysystem errors
        if (str_contains($msg, "gdrive")
            || str_contains($msg, "Google")
            || str_contains($msg, "invalid_grant")
            || str_contains($msg, "quotaExceeded")
            || str_contains($msg, "UNAUTHENTICATED")
            || str_contains($msg, "CREDENTIALS_MISSING")
            || str_contains($msg, "serviceAccountCredentials")) {

            $diagnosis['category'] = 'Google Drive Storage Error';
            $diagnosis['title']    = "Google Drive Upload Error";
            $diagnosis['what_happened'][] = "SFTP connection to the node succeeded, but streaming the file to Google Drive failed: {$msg}";

            if (str_contains($msg, "CREDENTIALS_MISSING") || str_contains($msg, "UNAUTHENTICATED")) {
                $diagnosis['recommendations'][] = "Google authentication credentials are missing or invalid.";
                $diagnosis['recommendations'][] = "For Personal Google Drive (OAuth), ensure GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, and GDRIVE_REFRESH_TOKEN are set in .env.";
                $diagnosis['recommendations'][] = "For Service Accounts, ensure GDRIVE_SERVICE_ACCOUNT_PATH points to a valid credentials JSON file.";
            } elseif (str_contains($msg, "invalid_grant")) {
                $diagnosis['recommendations'][] = "Google OAuth refresh token or Service Account key is expired/invalid. Re-authenticate or update the credentials.";
            } elseif (str_contains($msg, "quotaExceeded")) {
                $diagnosis['recommendations'][] = "Your Google Drive account has run out of storage space. Free up space or upgrade storage.";
            } else {
                $diagnosis['recommendations'][] = "Verify your `GDRIVE_BACKUP_FOLDER_ID` in `.env` (should be folder name like `convoy-backups`).";
            }
            return $diagnosis;
        }

        // 5. Memory limit errors
        if (str_contains($msg, "Allowed memory size") || str_contains($msg, "memory exhausted")) {
            $diagnosis['category'] = 'PHP Memory Limit Exceeded';
            $diagnosis['title']    = "PHP Memory Limit Exhausted During Stream";
            $diagnosis['what_happened'][] = "The backup file is very large and exceeded the PHP CLI memory limit.";
            $diagnosis['recommendations'][] = "Run the command with unlimited memory: `php -d memory_limit=2G artisan server:upload-pending-backups --sync`.";
            $diagnosis['recommendations'][] = "Increase `memory_limit` in `/etc/php/8.x/cli/php.ini`.";
            return $diagnosis;
        }

        // Fallback generic
        $diagnosis['what_happened'][] = $msg;
        if ($nodeReport && !empty($nodeReport['recommendations'])) {
            $diagnosis['recommendations'] = $nodeReport['recommendations'];
        } else {
            $diagnosis['recommendations'][] = "Review the full stack trace and ensure node SSH settings and Google Drive credentials are fully configured.";
        }

        return $diagnosis;
    }

    /**
     * Check if an IP address belongs to Cloudflare's known proxy CIDR ranges.
     */
    public function isCloudflareIp(string $ip): bool
    {
        $cfPrefixes = [
            '104.16.', '104.17.', '104.18.', '104.19.', '104.20.', '104.21.',
            '104.22.', '104.23.', '104.24.', '104.25.', '104.26.', '104.27.',
            '172.64.', '172.65.', '172.66.', '172.67.',
            '162.158.', '162.159.', '108.162.', '198.41.', '141.101.',
            '188.114.', '190.93.', '197.234.', '103.21.', '103.22.', '103.31.',
        ];

        foreach ($cfPrefixes as $prefix) {
            if (str_starts_with($ip, $prefix)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Normalizes a private key string to standard PEM format with newlines.
     */
    public function normalizePrivateKey(string $rawKey): string
    {
        $rawKey = trim($rawKey);
        if (!str_contains($rawKey, "\n")) {
            if (preg_match('/^(-----BEGIN [A-Z0-9 ]+-----)\s+(.+)\s+(-----END [A-Z0-9 ]+-----)$/', $rawKey, $m)) {
                $header = $m[1];
                $body   = str_replace(' ', '', $m[2]);
                $footer = $m[3];
                return $header . "\n" . trim(chunk_split($body, 64, "\n")) . "\n" . $footer;
            }
        }
        return $rawKey;
    }
}
