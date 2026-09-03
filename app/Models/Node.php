<?php



namespace Convoy\Models;

use Convoy\Casts\MebibytesToAndFromBytes;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

class Node extends Model
{
    use HasFactory;

    /**
     * The attributes excluded from the model's JSON form.
     */
    protected $hidden = [
        'token_id',
        'secret',
        'ssh_private_key',
    ];

    /**
     * Cast values to correct type.
     */
    protected $casts = [
        'verify_tls'       => 'boolean',
        'hidden'           => 'boolean',
        'allow_relocation' => 'boolean',
        'memory'           => MebibytesToAndFromBytes::class,
        'disk'             => MebibytesToAndFromBytes::class,
        'secret'           => 'encrypted',
        'ssh_private_key'  => 'encrypted',
    ];

    /**
     * Fields that aren't mass assignable
     */
    protected $guarded = ['id', 'created_at', 'updated_at'];

    public static array $validationRules = [
        'location_id'         => 'required|integer|exists:locations,id',
        'name'                => 'required|string|max:191',
        'cluster'             => 'required|string|max:191',
        'verify_tls'          => 'sometimes|boolean',
        'hidden'              => 'sometimes|boolean',
        'allow_relocation'    => 'sometimes|boolean',
        'fqdn'                => 'required|string|max:191',
        'token_id'            => 'required|string|max:191',
        'secret'              => 'required|string|max:191',
        'port'                => 'required|integer|min:1|max:65535',
        'memory'              => 'required|integer',
        'memory_overallocate' => 'required|integer',
        'disk'                => 'required|integer',
        'disk_overallocate'   => 'required|integer',
        'vm_storage'          => ['required', 'string', 'max:191', 'regex:/^\S*$/u'],
        'backup_storage'      => ['required', 'string', 'max:191', 'regex:/^\S*$/u'],
        'iso_storage'         => ['required', 'string', 'max:191', 'regex:/^\S*$/u'],
        'network'             => ['required', 'string', 'max:191', 'regex:/^\S*$/u'],
        'coterm_id'           => 'sometimes|nullable|integer|exists:coterms,id',
        // SSH / backup upload fields
        'ssh_host'            => 'sometimes|nullable|string|max:191',
        'ssh_port'            => 'sometimes|integer|min:1|max:65535',
        'ssh_username'        => 'sometimes|string|max:191',
        'ssh_private_key'     => 'sometimes|nullable|string',
        'backup_path'         => 'sometimes|nullable|string|max:500',
    ];

    /**
     * Get the connection address to use when making calls to this node's assigned Coterm endpoint.
     */
    public function getCotermConnectionAddress(): string
    {
        return sprintf(
            '%s://%s:%s', $this->coterm_tls_enabled ? 'https' : 'http', $this->coterm_fqdn,
            $this->coterm_port,
        );
    }

    /**
     * Returns the filesystem path on this node where Proxmox stores backup archives.
     * Falls back to the standard Proxmox dir-storage path if not explicitly set.
     */
    public function getBackupBasePath(): string
    {
        return $this->backup_path ?? '/var/lib/vz/dump';
    }

    public function servers(): HasMany
    {
        return $this->hasMany(Server::class);
    }

    public function addressPools(): BelongsToMany
    {
        return $this->belongsToMany(
            AddressPool::class,
            'address_pool_to_node',
            'node_id',
            'address_pool_id',
        );
    }

    public function addresses(): HasManyThrough
    {
        return $this->hasManyThrough(
            Address::class,
            AddressPoolToNode::class,
            'node_id',
            'address_pool_id',
            'id',
            'address_pool_id',
        );
    }

    public function templateGroups(): HasMany
    {
        return $this->hasMany(TemplateGroup::class);
    }

    public function isos(): HasMany
    {
        return $this->hasMany(ISO::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function coterm(): BelongsTo
    {
        return $this->belongsTo(Coterm::class);
    }

    public function getDiskAllocatedAttribute(): int
    {
        return (int) $this->servers()->sum('disk');
    }

    public function getMemoryAllocatedAttribute(): int
    {
        return (int) $this->servers()->sum('memory');
    }

    public function getRouteKeyName(): string
    {
        return 'id';
    }
}

