<?php

return [
    /*
|--------------------------------------------------------------------------
| Guzzle Connections
|--------------------------------------------------------------------------
|
| Configure the timeout to be used for Guzzle connections here.
*/
    'guzzle' => [
        'timeout' => env('GUZZLE_TIMEOUT', 15),
        'connect_timeout' => env('GUZZLE_CONNECT_TIMEOUT', 5),
    ],

    /*
|--------------------------------------------------------------------------
| Pterodactyl Auto-Deploy
|--------------------------------------------------------------------------
|
| Settings for the one-click Pterodactyl + Wings cloud-init provisioner.
| template_vmid: VMID of the base Ubuntu 22.04 cloud-init template in Proxmox.
| default_node_id: ID of the Node record to provision the deploy VM on.
*/
    'pterodactyl' => [
        'template_vmid'   => env('PTERODACTYL_TEMPLATE_VMID', 1002),
        'default_node_id' => env('PTERODACTYL_DEFAULT_NODE_ID', 1),
    ],
];
