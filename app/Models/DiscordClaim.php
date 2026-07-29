<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiscordClaim extends Model
{
    protected $table = 'discord_claims';

    protected $fillable = [
        'user_id',
        'task_key',
        'discord_id',
        'reward_bolts',
        'claimed_at',
    ];

    protected $casts = [
        'reward_bolts' => 'decimal:2',
        'claimed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
