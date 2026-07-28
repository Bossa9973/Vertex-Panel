<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CreditTransaction extends Model
{
    protected $table = 'credit_transactions';

    protected $fillable = [
        'user_id',
        'amount',
        'type',
        'description',
        'reference_id',
    ];

    protected $casts = [
        'amount' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
