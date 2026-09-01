<?php



namespace Convoy\Providers;

use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Sanctum;
use Convoy\Models\PersonalAccessToken;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

        if (!class_exists('App\Models\Server', false)) {
            class_alias(\Convoy\Models\Server::class, 'App\Models\Server');
        }
        if (!class_exists('App\Services\VertexTunnelService', false)) {
            class_alias(\Convoy\Services\VertexTunnelService::class, 'App\Services\VertexTunnelService');
        }

        // Register the Google Drive Flysystem adapter.
        // Uses a service account JSON key file placed at the path defined by
        // GDRIVE_SERVICE_ACCOUNT_PATH (default: storage/app/gdrive-service-account.json).
        // The backup folder is shared with the service account in Google Drive.
        Storage::extend('google', function ($app, $config) {
            $options = [];

            if (!empty($config['teamDriveId'] ?? null)) {
                $options['teamDriveId'] = $config['teamDriveId'];
            }

            // Service account credentials take priority over OAuth tokens.
            if (!empty($config['serviceAccountCredentials'] ?? null)
                && file_exists($config['serviceAccountCredentials'])
            ) {
                $client = new \Google\Client();
                $client->setAuthConfig($config['serviceAccountCredentials']);
                $client->addScope(\Google\Service\Drive::DRIVE);
                $client->setApplicationName('Convoy Panel');
            } else {
                $client = new \Google\Client();
                $client->setClientId($config['clientId'] ?? '');
                $client->setClientSecret($config['clientSecret'] ?? '');
                $client->refreshToken($config['refreshToken'] ?? '');
            }

            $service = new \Google\Service\Drive($client);
            $adapter = new \Masbug\Flysystem\GoogleDriveAdapter(
                $service,
                $config['folderId'] ?? '/',
                $options
            );
            $driver = new \League\Flysystem\Filesystem($adapter);

            return new FilesystemAdapter($driver, $adapter);
        });
    }
}
