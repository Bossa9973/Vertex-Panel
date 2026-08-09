<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellerPlan extends Model
{
    use HasFactory;

    protected $table = 'reseller_plans';

    protected $fillable = [
        'reseller_id',
        'vps_plan_id',
        'model_type',
        'base_price',
        'markup_percent',
        'custom_price',
        'active',
    ];

    protected $casts = [
        'base_price' => 'float',
        'markup_percent' => 'float',
        'custom_price' => 'float',
        'active' => 'boolean',
    ];

    public function reseller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reseller_id');
    }

    public function vpsPlan(): BelongsTo
    {
        return $this->belongsTo(VpsPlan::class, 'vps_plan_id');
    }
}
