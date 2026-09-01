<?php



namespace Convoy\Transformers\Client;

use Convoy\Models\Backup;
use League\Fractal\TransformerAbstract;

class BackupTransformer extends TransformerAbstract
{
    /**
     * List of resources to automatically include
     */
    protected array $defaultIncludes = [
        //
    ];

    /**
     * List of resources possible to include
     */
    protected array $availableIncludes = [
        //
    ];

    /**
     * A Fractal transformer.
     *
     * NOTE: cloud_path is intentionally excluded — only the signed URL is ever
     * returned to the client via BackupController::download().
     */
    public function transform(Backup $backup): array
    {
        return [
            'uuid'         => $backup->uuid,
            'is_successful' => $backup->is_successful,
            'is_locked'    => $backup->is_locked,
            'name'         => $backup->name,
            'size'         => $backup->size,
            'cloud_status' => $backup->cloud_status ?? 'pending',
            'completed_at' => $backup->completed_at,
            'created_at'   => $backup->created_at,
        ];
    }
}

