<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellerTransaction extends Model
{
    use HasFactory;

    protected $table = 'reseller_transactions';

    protected $fillable = [
        'user_id',
        'type',
        'coin',
        'amount',
        'reference_id',
        'description',
    ];

    protected $casts = [
        'amount' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
