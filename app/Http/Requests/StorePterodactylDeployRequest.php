<?php

namespace Convoy\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePterodactylDeployRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            // Cloudflare
            'cf_tunnel_token'  => ['required', 'string', 'min:100'],
            'panel_fqdn'       => ['required', 'string', 'regex:/^[a-zA-Z0-9.\-]+$/'],
            'wings_fqdn'       => ['required', 'string', 'regex:/^[a-zA-Z0-9.\-]+$/'],

            // Admin account credentials
            'admin_email'      => ['required', 'email'],
            'admin_username'   => ['required', 'string', 'alpha_num', 'max:32'],
            'admin_firstname'  => ['required', 'string', 'max:64'],
            'admin_lastname'   => ['required', 'string', 'max:64'],

            // Optional — server-generated if blank
            'admin_password'   => ['nullable', 'string', 'alpha_num', 'min:12'],
            'db_password'      => ['nullable', 'string', 'alpha_num', 'min:12'],

            // Node specs passed to the Pterodactyl API (not to Proxmox directly)
            'timezone'         => ['nullable', 'string', 'max:64'],
            'node_name'        => ['required', 'string', 'max:64'],
            'node_memory'      => ['required', 'integer', 'min:512'],    // MiB
            'node_disk'        => ['required', 'integer', 'min:5120'],   // MiB
            'location_short'   => ['required', 'string', 'alpha_num', 'max:10'],
        ];
    }

    public function messages(): array
    {
        return [
            'cf_tunnel_token.min' =>
                'Tunnel token is too short — copy the full token from Cloudflare Zero Trust.',
            'panel_fqdn.regex'    =>
                'Panel domain must be a plain hostname without http:// or trailing slashes.',
            'wings_fqdn.regex'    =>
                'Wings domain must be a plain hostname without http:// or trailing slashes.',
            'node_memory.min'     => 'Minimum node RAM is 512 MiB.',
            'node_disk.min'       => 'Minimum node disk is 5120 MiB (5 GB).',
        ];
    }
}
