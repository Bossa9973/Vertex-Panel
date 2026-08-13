<?php

namespace Convoy\Models;

use Convoy\Enums\Api\ApiKeyType;
use Eloquent;
use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Access\Authorizable as AuthorizableContract;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Foundation\Auth\Access\Authorizable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;
use Laravel\Sanctum\NewAccessToken;
use Convoy\Models\ResellerCoinBalance;

/**
 * @mixin Eloquent
 */
class User extends Model implements AuthenticatableContract, AuthorizableContract
{
    use Authenticatable, Authorizable, HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'name',
        'email',
        'credits',
        'discord_id',
        'discord_username',
        'google_id',
        'google_email',
        'primary_auth_provider',
        'password',
        'root_admin',
        'admin_role_id',
        'hide_ip_in_audit',
        'is_reseller',
        'reseller_notes',
        'reseller_plan_type',
    ];

    /**
     * Rules verifying that the data being stored matches the expectations of the database.
     */
    public static array $validationRules = [
        'email' => 'required|email|between:1,191|unique:users,email',
        'name' => 'required|string|between:1,191',
        'password' => ['sometimes', 'min:8', 'max:191', 'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])(?=.{8,})/u', 'string'],
        'root_admin' => 'boolean',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<int, string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'email_verified_at',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'two_factor_confirmed_at',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'email_verified_at' => 'datetime',
        'root_admin' => 'boolean',
        'credits' => 'float',
        'hide_ip_in_audit' => 'boolean',
        'is_reseller' => 'boolean',
    ];

    public function toReactObject(): array
    {
        try {
            $data = Collection::make($this->toArray())->except(['id'])->toArray();
        } catch (\Throwable $e) {
            $data = [];
        }

        $data['credits'] = (float) ($this->credits ?? 0);
        $data['discord_id'] = $this->discord_id ?? null;
        $data['discord_username'] = $this->discord_username ?? null;
        $data['google_id'] = $this->google_id ?? null;
        $data['google_email'] = $this->google_email ?? null;
        $data['primary_auth_provider'] = $this->primary_auth_provider ?? 'email';
        $data['hide_ip_in_audit'] = (bool) ($this->hide_ip_in_audit ?? false);
        $data['is_reseller'] = (bool) ($this->is_reseller ?? false);
        $data['reseller_notes'] = $this->reseller_notes ?? null;
        $data['reseller_plan_type'] = $this->reseller_plan_type ?? null;

        // Include admin role permissions safely
        if ($this->root_admin) {
            try {
                $role = $this->adminRole;
                $data['admin_role_id']   = $this->admin_role_id ?? null;
                $data['admin_role_name'] = $role?->name;
                $data['admin_role_color'] = $role?->color;
                $data['admin_permissions'] = $role ? ($role->permissions ?? []) : null;
            } catch (\Throwable $e) {
                $data['admin_role_id']    = null;
                $data['admin_role_name']  = null;
                $data['admin_role_color'] = null;
                $data['admin_permissions'] = null;
            }
        } else {
            $data['admin_role_id']    = null;
            $data['admin_role_name']  = null;
            $data['admin_role_color'] = null;
            $data['admin_permissions'] = null;
        }

        return $data;
    }

    /**
     * Check whether this admin user has a specific permission.
     *
     * Rules:
     *  - Non-admins always return false.
     *  - Admins with NO role assigned (null admin_role_id) have FULL access.
     *  - The CEO super-admin always has full access regardless of role.
     *  - Otherwise check the role's permissions array.
     */
    public function hasAdminPermission(string $permission): bool
    {
        if (! $this->root_admin) {
            return false;
        }

        // CEO / no-role admins = full access
        if ($this->email === config('app.super_admin_email') || is_null($this->admin_role_id)) {
            return true;
        }

        $role = $this->adminRole;
        if (! $role) {
            return true; // role was deleted, treat as full access
        }

        return in_array($permission, $role->permissions ?? [], true);
    }

    public function createToken(
        string $name,
        ApiKeyType $type,
        array $abilities = ['*'],
    ): NewAccessToken {
        $token = $this->tokens()->create([
            'type' => $type,
            'name' => $name,
            'token' => hash('sha256', $plainTextToken = Str::random(40)),
            'abilities' => $abilities,
        ]);

        return new NewAccessToken($token, $token->getKey().'|'.$plainTextToken);
    }

    public function tokens(): MorphMany
    {
        return $this->morphMany(PersonalAccessToken::class, 'tokenable');
    }

    public function adminRole(): BelongsTo
    {
        return $this->belongsTo(AdminRole::class, 'admin_role_id');
    }

    public function servers(): HasMany
    {
        return $this->hasMany(Server::class);
    }

    public function creditTransactions(): HasMany
    {
        return $this->hasMany(CreditTransaction::class);
    }

    public function coinBalances(): HasMany
    {
        return $this->hasMany(ResellerCoinBalance::class);
    }

    public function getRouteKeyName(): string
    {
        return 'id';
    }

    protected static function boot(): void
    {
        parent::boot();

        static::creating(function (User $user) {
            $user->uuid = Str::uuid()->toString();
        });
    }
}
