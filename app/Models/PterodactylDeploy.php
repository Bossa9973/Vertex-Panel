<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PterodactylDeploy extends Model
{
    // Match codebase pattern — $guarded not $fillable
    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        // encrypted:array encrypts the JSON at rest using APP_KEY.
        // NEVER store raw passwords in plaintext — always use this cast.
        'config'      => 'encrypted:array',
        'credentials' => 'encrypted:array',
    ];

    // Skip the base Model's validation for this model — it has no $validationRules
    // and the schema has nullable columns that would fail generic validation.
    protected bool $skipValidation = true;

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
