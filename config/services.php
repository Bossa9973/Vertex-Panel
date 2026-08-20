<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI', env('APP_URL', 'http://localhost') . '/auth/social/google/callback'),
    ],

    'discord' => [
        'client_id' => env('DISCORD_CLIENT_ID'),
        'client_secret' => env('DISCORD_CLIENT_SECRET'),
        'redirect' => env('DISCORD_REDIRECT_URI', env('APP_URL', 'http://localhost') . '/auth/social/discord/callback'),
    ],

    'maxelpay' => [
        'api_key'    => env('MAXELPAY_API_KEY', ''),
        'secret_key' => env('MAXELPAY_SECRET_KEY', ''),
        'mode'       => env('MAXELPAY_PAYMENT_MODE', 'STAGING'),
    ],

    'nowpayments' => [
        'api_key'    => env('NOWPAYMENTS_API_KEY', ''),
        'ipn_secret' => env('NOWPAYMENTS_IPN_SECRET', ''),
        'mode'       => env('NOWPAYMENTS_MODE', 'SANDBOX'),
    ],

    'sish' => [
        'domain'            => env('SISH_RELAY_HOST', 'ssh.vertexnodes.top'),
        'admin_console_url' => env('SISH_ADMIN_CONSOLE_URL'),
        'admin_token'       => env('SISH_ADMIN_TOKEN'),
        'pubkeys_path'      => env('SISH_PUBKEYS_PATH', '/root/sish/pubkeys'),
    ],

];
