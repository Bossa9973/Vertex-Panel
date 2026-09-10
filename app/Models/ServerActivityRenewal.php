<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Builder;
use Carbon\Carbon;

class ServerActivityRenewal extends Model
{
    use HasFactory;

    protected $table = 'server_activity_renewals';

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'step_number' => 'integer',
        'started_at'  => 'datetime',
        'verified_at' => 'datetime',
        'claimed_at'  => 'datetime',
        'expires_at'  => 'datetime',
    ];

    public const STATUS_PENDING           = 'pending';
    public const STATUS_VERIFIED          = 'verified';
    public const STATUS_CLAIMED           = 'claimed';  // auto-granted on landing (no manual code)
    public const STATUS_BYPASSED_REJECTED = 'bypassed_rejected';
    public const STATUS_EXPIRED           = 'expired';

    public const TYPE_ACTIVE_RENEWAL      = 'active_renewal';
    public const TYPE_REACTIVATION_STEP   = 'reactivation_step';

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    public function scopeVerified(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_VERIFIED);
    }

    public function isExpired(): bool
    {
        return $this->expires_at && Carbon::now()->isAfter($this->expires_at);
    }

    public function isClaimed(): bool
    {
        return $this->status === self::STATUS_CLAIMED;
    }
}
