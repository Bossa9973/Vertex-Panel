<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellerWithdrawal extends Model
{
    use HasFactory;

    protected $table = 'reseller_withdrawals';

    protected $fillable = [
        'uuid',
        'user_id',
        'coin',
        'amount',
        'wallet_address',
        'status',
        'tx_hash',
        'admin_notes',
    ];

    protected $casts = [
        'amount' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
