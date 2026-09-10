<?php

namespace Convoy\Data\Server\Eloquent;

use Spatie\LaravelData\Data;

class ServerEloquentData extends Data
{
    public function __construct(
        public int              $id,
        public string           $uuid_short,
        public string           $uuid,
        public int              $node_id,
        public string           $hostname,
        public string           $name,
        public ?string          $description,
        public ?string          $status,
        public ?string          $created_at,
        public ?string          $expires_at,
        public ServerUsagesData $usages,
        public ServerLimitsData $limits,
        public string $plan_tier = 'free',
        public ?string $activity_expires_at = null,
        public ?string $deletion_deadline_at = null,
        public int $reactivation_codes_completed = 0,
        public int $reactivation_codes_required = 3,
        public string $lifecycle_phase = 'active',
    )
    {
    }
}
