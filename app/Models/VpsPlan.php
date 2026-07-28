<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class VpsPlan extends Model
{
    use HasFactory;

    protected $table = 'vps_plans';

    protected $fillable = [
        'name',
        'ram',
        'cpu',
        'disk',
        'price',
        'description',
    ];

    protected $casts = [
        'ram' => 'integer',
        'cpu' => 'integer',
        'disk' => 'integer',
        'price' => 'float',
    ];
}
