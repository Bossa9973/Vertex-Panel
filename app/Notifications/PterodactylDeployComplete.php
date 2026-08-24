<?php

namespace Convoy\Notifications;

use Convoy\Models\PterodactylDeploy;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PterodactylDeployComplete extends Notification
{
    public function __construct(
        private PterodactylDeploy $deploy
    ) {}

    /**
     * Matches the pattern used by the existing VerifyEmail notification.
     */
    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        $creds = $this->deploy->credentials;

        return (new MailMessage)
            ->subject('Your Pterodactyl Panel is Ready')
            ->greeting('Your panel is live! 🚀')
            ->line('Installation complete. Here are your login details:')
            ->line("**Panel URL:** {$creds['panel_url']}")
            ->line("**Email:** {$creds['admin_email']}")
            ->line("**Password:** {$creds['admin_password']}")
            ->line("**Node {$creds['node_id']} status:** {$creds['node_status']}")
            ->line('---')
            ->line('**Action required — Cloudflare DNS:**')
            ->line('Go to your Cloudflare dashboard → Zero Trust → Tunnels → your tunnel → Public Hostnames and add the following entries:')
            ->line("`{$this->deploy->panel_fqdn}` → `http://localhost:80`")
            ->line("`{$this->deploy->wings_fqdn}` → `http://localhost:8080` (Wings API)")
            ->line('Also add a TCP tunnel entry for SFTP: `' . $this->deploy->wings_fqdn . ':2022` → `tcp://localhost:2022`')
            ->line('Once those records are saved your panel will be accessible at the URL above.')
            ->salutation('— Vertex Panel');
    }
}
