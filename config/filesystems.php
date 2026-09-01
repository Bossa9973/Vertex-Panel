<?php

return [

    'default' => env('FILESYSTEM_DISK', 'local'),

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app'),
            'throw' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
        ],

        // Google Drive disk for VM backup archiving.
        // Uses a service account JSON key file shared with your Drive folder.
        // Required env vars:
        //   GDRIVE_BACKUP_FOLDER_ID  - ID of the convoy-backups folder in Drive
        //   GDRIVE_SERVICE_ACCOUNT_PATH - path to the service account JSON (defaults below)
        'gdrive' => [
            'driver' => 'google',
            'clientId' => env('GDRIVE_CLIENT_ID', ''),
            'clientSecret' => env('GDRIVE_CLIENT_SECRET', ''),
            'refreshToken' => env('GDRIVE_REFRESH_TOKEN', ''),
            'serviceAccountCredentials' => env(
                'GDRIVE_SERVICE_ACCOUNT_PATH',
                storage_path('app/gdrive-service-account.json')
            ),
            'folderId' => env('GDRIVE_BACKUP_FOLDER_ID'),
            'teamDriveId' => env('GDRIVE_TEAM_DRIVE_ID'),
            'throw' => true,
        ],

    ],

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
