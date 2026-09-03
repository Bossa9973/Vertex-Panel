<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ServerRelocation extends Model
{
    use HasFactory;

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'backup_success' => 'boolean',
        'reused_ip'      => 'boolean',
        'old_expires_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function oldServer(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'old_server_id');
    }

    public function newServer(): BelongsTo
    {
        return $this->belongsTo(Server::class, 'new_server_id');
    }

    public function sourceNode(): BelongsTo
    {
        return $this->belongsTo(Node::class, 'source_node_id');
    }

    public function targetNode(): BelongsTo
    {
        return $this->belongsTo(Node::class, 'target_node_id');
    }
}
