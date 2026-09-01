<?php



namespace Convoy\Models;

use Convoy\Casts\MebibytesToAndFromBytes;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Backup extends Model
{
    use HasFactory, SoftDeletes;

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'completed_at'      => 'datetime',
        'cloud_uploaded_at' => 'datetime',
        'size'              => MebibytesToAndFromBytes::class,
    ];

    /**
     * Default attribute values.
     */
    protected $attributes = [
        'cloud_status' => 'pending',
    ];

    public static array $validationRules = [
        'uuid'         => 'required|uuid',
        'server_id'    => 'required|exists:servers,id',
        'is_successful' => 'sometimes|boolean',
        'is_locked'    => 'sometimes|boolean',
        'name'         => 'required|string|min:1|max:40',
        'file_name'    => 'nullable|string',
        'size'         => 'sometimes|numeric|min:0',
        'completed_at' => 'nullable|date',
        'cloud_status' => 'sometimes|in:pending,uploading,uploaded,failed',
    ];

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}

