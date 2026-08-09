<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResellerPaymentLink extends Model
{
    use HasFactory;

    protected $table = 'reseller_payment_links';

    protected $fillable = [
        'uuid',
        'reseller_id',
        'reseller_plan_id',
        'vps_plan_id',
        'node_id',
        'template_uuid',
        'server_name',
        'model_type',
        'base_price',
        'selling_price',
        'markup_amount',
        'coin',
        'status',
        'client_user_id',
        'server_id',
        'paid_at',
        'nowpayments_payment_id',
        'checkout_url',
        'nowpayments_status',
    ];

    protected $casts = [
        'base_price' => 'float',
        'selling_price' => 'float',
        'markup_amount' => 'float',
        'paid_at' => 'datetime',
    ];

    public function reseller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reseller_id');
    }

    public function resellerPlan(): BelongsTo
    {
        return $this->belongsTo(ResellerPlan::class, 'reseller_plan_id');
    }

    public function vpsPlan(): BelongsTo
    {
        return $this->belongsTo(VpsPlan::class, 'vps_plan_id');
    }

    public function node(): BelongsTo
    {
        return $this->belongsTo(Node::class, 'node_id');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_user_id');
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'server_id');
    }
}
