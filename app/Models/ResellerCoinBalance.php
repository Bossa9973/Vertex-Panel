<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellerCoinBalance extends Model
{
    use HasFactory;

    protected $table = 'reseller_coin_balances';

    protected $fillable = [
        'user_id',
        'coin',
        'balance',
        'locked_balance',
    ];

    protected $casts = [
        'balance' => 'float',
        'locked_balance' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
