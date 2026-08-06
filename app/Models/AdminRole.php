<?php

namespace Convoy\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Represents an admin role that scopes which admin-panel sections
 * and actions a root_admin user is allowed to access.
 *
 * @property int    $id
 * @property string $name
 * @property string $color
 * @property string|null $description
 * @property array  $permissions   JSON-decoded array of permission keys
 */
class AdminRole extends Model
{
    protected $table = 'admin_roles';

    protected $fillable = [
        'name',
        'color',
        'description',
        'permissions',
    ];

    protected $casts = [
        'permissions' => 'array',
    ];

    // ─── Permission Catalogue ───────────────────────────────────────────────
    /**
     * Full list of available permission keys with human-readable labels
     * and the admin-panel section they guard.
     */
    public const PERMISSIONS = [
        // Visibility permissions
        'view_overview'    => ['label' => 'View Overview',     'section' => 'Overview',     'category' => 'Visibility'],
        'view_nodes'       => ['label' => 'View Nodes',        'section' => 'Nodes',        'category' => 'Visibility'],
        'view_servers'     => ['label' => 'View Servers',      'section' => 'Servers',      'category' => 'Visibility'],
        'view_users'       => ['label' => 'View Users',        'section' => 'Users',        'category' => 'Visibility'],
        'view_ipam'        => ['label' => 'View IPAM',         'section' => 'IPAM',         'category' => 'Visibility'],
        'view_locations'   => ['label' => 'View Locations',    'section' => 'Locations',    'category' => 'Visibility'],
        'view_coterms'     => ['label' => 'View Coterms',      'section' => 'Coterms',      'category' => 'Visibility'],
        'view_plans'       => ['label' => 'View VPS Plans',    'section' => 'Plans',        'category' => 'Visibility'],
        'view_tokens'      => ['label' => 'View API Tokens',   'section' => 'API Tokens',   'category' => 'Visibility'],
        'view_maintenance' => ['label' => 'View Maintenance',  'section' => 'Maintenance',  'category' => 'Visibility'],
        'view_audit_logs'  => ['label' => 'View System Audit Logs', 'section' => 'Audit Logs', 'category' => 'Visibility'],
        // Action permissions
        'manage_balances'  => ['label' => 'Manage BOLT Balances',    'section' => 'User Balances', 'category' => 'Actions'],
        'manage_users'     => ['label' => 'Manage User Accounts',    'section' => 'Users',         'category' => 'Actions'],
        'manage_servers'   => ['label' => 'Manage Servers',          'section' => 'Servers',       'category' => 'Actions'],
        'manage_nodes'     => ['label' => 'Manage Nodes',            'section' => 'Nodes',         'category' => 'Actions'],
        'manage_plans'     => ['label' => 'Manage VPS Plans',        'section' => 'Plans',         'category' => 'Actions'],
        'manage_settings'  => ['label' => 'Manage System Settings',  'section' => 'Maintenance',   'category' => 'Actions'],
        'manage_ip_privacy'=> ['label' => 'Manage User Audit IP Privacy', 'section' => 'Audit Logs', 'category' => 'Actions'],
    ];

    // ─── Relationships ──────────────────────────────────────────────────────
    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'admin_role_id');
    }
}
