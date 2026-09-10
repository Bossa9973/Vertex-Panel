<?php



namespace Convoy\Models;

use Convoy\Casts\MebibytesToAndFromBytes;
use Convoy\Enums\Server\Status;
use Convoy\Exceptions\Http\Server\ServerStatusConflictException;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

class Server extends Model
{
    use HasFactory;

    protected $casts = [
        'memory'          => MebibytesToAndFromBytes::class,
        'disk'            => MebibytesToAndFromBytes::class,
        'bandwidth_usage' => MebibytesToAndFromBytes::class,
        'bandwidth_limit' => MebibytesToAndFromBytes::class,
        'expires_at'                   => 'datetime',
        'activity_expires_at'          => 'datetime',
        'suspended_at'                 => 'datetime',
        'deletion_deadline_at'         => 'datetime',
        'reactivation_codes_completed' => 'integer',
        'reactivation_codes_required'  => 'integer',
    ];

    protected $guarded = [
        'id',
        'updated_at',
        'created_at',
    ];

    public static array $validationRules = [
        'name'            => 'required|string|min:1|max:40',
        'node_id'         => 'required|integer|exists:nodes,id',
        'user_id'         => 'required|integer|exists:users,id',
        'vmid'            => 'required|numeric|min:100|max:999999999',
        'hostname'        => 'required|string|min:1|max:191',
        'status'          => ['sometimes', 'nullable', 'string', 'in:installing,install_failed,suspended,restoring_backup,restoring_snapshot,deleting,deletion_failed'],
        'cpu'             => 'required|numeric|min:1',
        'memory'          => 'required|numeric|min:16777216',
        'disk'            => 'required|numeric|min:1',
        'bandwidth_usage' => 'sometimes|numeric|min:0',
        'snapshot_limit'  => 'present|nullable|integer|min:0',
        'backup_limit'    => 'present|nullable|integer|min:0',
        'bandwidth_limit' => 'present|nullable|integer|min:0',
        'hydrated_at'     => 'nullable|date',
        // Tier: free = no auto-backup, paid = scheduled daily cloud backups + UI badge
        'plan_tier'       => 'sometimes|string|in:free,paid',
    ];

    public function node(): BelongsTo
    {
        return $this->belongsTo(Node::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(Address::class);
    }

    public function template(): HasOne
    {
        return $this->hasOne(Template::class);
    }

    public function backups(): HasMany
    {
        return $this->hasMany(Backup::class);
    }

    public function activityRenewals(): HasMany
    {
        return $this->hasMany(ServerActivityRenewal::class);
    }

    /**
     * Returns all the activity log entries where the server is the subject.
     */
    public function activity(): MorphToMany
    {
        return $this->morphToMany(ActivityLog::class, 'subject', 'activity_log_subjects');
    }

    public function isInstalled(): bool
    {
        return $this->status !== Status::INSTALLING->value;
    }

    public function isInstalling(): bool
    {
        return $this->status === Status::INSTALLING->value;
    }

    public function isSuspended(): bool
    {
        return $this->status === Status::SUSPENDED->value;
    }

    /**
     * Returns true when this server's tier includes automatic cloud backups.
     */
    public function hasPaidTier(): bool
    {
        return $this->plan_tier === 'paid';
    }

    public function isFreeTier(): bool
    {
        return $this->plan_tier !== 'paid';
    }

    /**
     * True if free server has reached 72h active expiration but is within the 30m grace window before suspension.
     */
    public function isInPreSuspendCritical(): bool
    {
        if ($this->hasPaidTier() || !$this->activity_expires_at || $this->isSuspended()) {
            return false;
        }

        $now = \Carbon\Carbon::now();
        $expiredAt = \Carbon\Carbon::parse($this->activity_expires_at);
        $suspendDeadline = $expiredAt->copy()->addMinutes(30);

        return $now->greaterThanOrEqualTo($expiredAt) && $now->lessThan($suspendDeadline);
    }

    /**
     * True if free server is suspended due to inactivity and within the 48-hour recovery window.
     */
    public function isAwaitingReactivation(): bool
    {
        if ($this->hasPaidTier() || !$this->isSuspended() || !$this->deletion_deadline_at) {
            return false;
        }

        return \Carbon\Carbon::now()->lessThan($this->deletion_deadline_at);
    }

    /**
     * True if free server is suspended and in its final 30-minute grace period before permanent deletion.
     */
    public function isInPreDeletionCritical(): bool
    {
        if ($this->hasPaidTier() || !$this->isSuspended() || !$this->deletion_deadline_at) {
            return false;
        }

        $now = \Carbon\Carbon::now();
        $deletionDeadline = \Carbon\Carbon::parse($this->deletion_deadline_at);
        $criticalStart = $deletionDeadline->copy()->subMinutes(30);

        return $now->greaterThanOrEqualTo($criticalStart) && $now->lessThan($deletionDeadline);
    }

    /**
     * True if free server has passed the 48-hour suspended deadline and is ready for permanent deletion.
     */
    public function isReadyForPermanentDeletion(): bool
    {
        if ($this->hasPaidTier() || !$this->isSuspended() || !$this->deletion_deadline_at) {
            return false;
        }

        return \Carbon\Carbon::now()->greaterThanOrEqualTo($this->deletion_deadline_at);
    }

    /**
     * Lifecycle phase string for UI and API clients:
     * - 'paid': Paid tier, exempt from timer
     * - 'active': Free server running normally (> 12h left on 72h timer)
     * - 'pre_suspend_warning': Free server with <= 12h left
     * - 'pre_suspend_critical': In 30m critical grace before suspension
     * - 'suspended_recovery': Suspended, in 48h window to complete 3 links
     * - 'pre_delete_critical': In final 30m before permanent deletion
     * - 'deleted': Past 48h deadline (queued for purge)
     */
    public function getActivityLifecyclePhase(): string
    {
        if ($this->hasPaidTier()) {
            return 'paid';
        }

        if ($this->isSuspended()) {
            if ($this->isReadyForPermanentDeletion()) {
                return 'deleted';
            }
            if ($this->isInPreDeletionCritical()) {
                return 'pre_delete_critical';
            }
            return 'suspended_recovery';
        }

        if ($this->isInPreSuspendCritical()) {
            return 'pre_suspend_critical';
        }

        if ($this->activity_expires_at) {
            $diffHours = \Carbon\Carbon::now()->diffInHours(\Carbon\Carbon::parse($this->activity_expires_at), false);
            if ($diffHours <= 12 && $diffHours >= 0) {
                return 'pre_suspend_warning';
            }
        }

        return 'active';
    }

    public function getReactivationProgress(): array
    {
        $completed = min(3, max(0, (int) $this->reactivation_codes_completed));
        return [
            'completed' => $completed,
            'required'  => 3,
            'remaining' => max(0, 3 - $completed),
            'display'   => "{$completed}/3",
        ];
    }

    /**
     * Checks if the server is currently in a user-accessible state. If not, an
     * exception is raised. This should be called whenever something needs to make
     * sure the server is not in a weird state that should block user access.
     *
     * @throws ServerStatusConflictException
     */
    public function validateCurrentState(): void
    {
        if (!is_null($this->status)) {
            throw new ServerStatusConflictException($this);
        }
    }

    protected static function booted(): void
    {
        static::deleting(function (Server $server) {
            $server->addresses()->update(['server_id' => null]);
        });
    }
}

