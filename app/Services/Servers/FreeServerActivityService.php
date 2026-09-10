<?php

namespace Convoy\Services\Servers;

use Convoy\Models\Server;
use Convoy\Models\User;
use Convoy\Models\ServerActivityRenewal;
use Convoy\Enums\Server\SuspensionAction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Carbon\Carbon;
use Exception;

class FreeServerActivityService
{
    public function __construct(
        private ServerSuspensionService $suspensionService
    ) {}

    /**
     * Start a new link verification session for either active renewal or suspended reactivation step.
     *
     * @throws Exception
     */
    public function startSession(Server $server, User $user, Request $request): array
    {
        if ($server->hasPaidTier()) {
            throw new Exception('Paid servers are exempt from free activity renewals.');
        }

        $isSuspended = $server->isSuspended();
        $sessionType = $isSuspended
            ? ServerActivityRenewal::TYPE_REACTIVATION_STEP
            : ServerActivityRenewal::TYPE_ACTIVE_RENEWAL;

        $stepNumber = $isSuspended
            ? min(3, max(1, ((int) $server->reactivation_codes_completed) + 1))
            : 1;

        // Check if a pending, unexpired session was created within the last 45 seconds for this exact step
        $recent = ServerActivityRenewal::where('server_id', $server->id)
            ->where('user_id', $user->id)
            ->where('session_type', $sessionType)
            ->where('step_number', $stepNumber)
            ->where('status', ServerActivityRenewal::STATUS_PENDING)
            ->where('started_at', '>=', Carbon::now()->subSeconds(45))
            ->where('expires_at', '>', Carbon::now())
            ->first();

        if ($recent) {
            return [
                'session_id'         => $recent->id,
                'token'              => $recent->token,
                'session_type'       => $recent->session_type,
                'step_number'        => $recent->step_number,
                'shrinkme_url'       => $recent->shrinkme_url ?: $recent->destination_url,
                'expires_in_seconds' => (int) max(0, Carbon::parse($recent->expires_at)->getTimestamp() - Carbon::now()->getTimestamp()),
                'started_at'         => $recent->started_at->toIso8601String(),
            ];
        }

        $token     = Str::random(48);
        $claimCode = 'ACT-' . strtoupper(Str::random(4)) . '-' . strtoupper(Str::random(4));
        $sig       = hash_hmac('sha256', "{$token}|{$server->id}|{$user->id}", config('app.key'));

        $baseUrl        = rtrim(config('app.url', url('/')), '/');
        $destinationUrl = "{$baseUrl}/activity/claim?session={$token}&sig={$sig}";

        // Shrinkme API Call
        $shrinkmeApiKey = DB::table('settings')->where('key', 'shrinkme_api_key')->value('value')
            ?: config('services.shrinkme.api_key', '');
        $shrinkmeEnabled = DB::table('settings')->where('key', 'shrinkme_enabled')->value('value');
        $isEnabled = $shrinkmeEnabled !== 'false' && $shrinkmeEnabled !== '0';

        $shortUrl = null;
        if (!empty($shrinkmeApiKey) && $isEnabled) {
            try {
                $apiUrl = "https://shrinkme.io/api?api=" . urlencode($shrinkmeApiKey) . "&url=" . urlencode($destinationUrl);
                $resp   = Http::timeout(6)->get($apiUrl);
                if ($resp->successful()) {
                    $json = $resp->json();
                    if (!empty($json['status']) && $json['status'] === 'success' && !empty($json['shortenedUrl'])) {
                        $shortUrl = $json['shortenedUrl'];
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('Shrinkme API generation failed, falling back to direct landing URL: ' . $e->getMessage());
            }
        }

        if (!$shortUrl) {
            $shortUrl = $destinationUrl;
        }

        $renewal = ServerActivityRenewal::create([
            'server_id'       => $server->id,
            'user_id'         => $user->id,
            'session_type'    => $sessionType,
            'step_number'     => $stepNumber,
            'token'           => $token,
            'claim_code'      => $claimCode,
            'shrinkme_url'    => $shortUrl,
            'destination_url' => $destinationUrl,
            'status'          => ServerActivityRenewal::STATUS_PENDING,
            'ip_address'      => $request->ip(),
            'user_agent'      => substr((string) $request->userAgent(), 0, 500),
            'started_at'      => Carbon::now(),
            'expires_at'      => Carbon::now()->addMinutes(15),
        ]);

        return [
            'session_id'         => $renewal->id,
            'token'              => $renewal->token,
            'session_type'       => $renewal->session_type,
            'step_number'        => $renewal->step_number,
            'shrinkme_url'       => $renewal->shrinkme_url,
            'expires_in_seconds' => 900,
            'started_at'         => $renewal->started_at->toIso8601String(),
        ];
    }

    /**
     * Verify token callback from landing page with Anti-Bypass checks.
     *
     * @throws Exception
     */
    public function verifyCallback(string $token, string $sig, User $user, Request $request): array
    {
        /** @var ServerActivityRenewal $renewal */
        $renewal = ServerActivityRenewal::where('token', $token)->firstOrFail();

        if ($renewal->user_id !== $user->id) {
            throw new Exception('Unauthorized: Renewal session belongs to a different user account.');
        }

        $expectedSig = hash_hmac('sha256', "{$token}|{$renewal->server_id}|{$user->id}", config('app.key'));
        if (!hash_equals($expectedSig, $sig)) {
            throw new Exception('Invalid or tampered security signature.');
        }

        if ($renewal->isExpired()) {
            $renewal->update(['status' => ServerActivityRenewal::STATUS_EXPIRED]);
            throw new Exception('This verification link has expired (15-minute window exceeded). Please start a new link.');
        }

        if ($renewal->status === ServerActivityRenewal::STATUS_BYPASSED_REJECTED) {
            throw new Exception('Anti-Bypass Warning: This verification was previously flagged and burned for bypasser tool usage.');
        }

        // If already verified or claimed, return code cleanly
        if (in_array($renewal->status, [ServerActivityRenewal::STATUS_VERIFIED, ServerActivityRenewal::STATUS_CLAIMED])) {
            return [
                'success'      => true,
                'claim_code'   => $renewal->claim_code,
                'session_type' => $renewal->session_type,
                'step_number'  => $renewal->step_number,
                'status'       => $renewal->status,
                'server_id'    => $renewal->server_id,
            ];
        }

        // Anti-Bypass Guard: Enforce strict minimum elapsed time
        $minSeconds = (int) (DB::table('settings')->where('key', 'shrinkme_min_seconds')->value('value')
            ?: config('services.shrinkme.min_seconds', 20));

        $startedTimestamp = Carbon::parse($renewal->started_at)->getTimestamp();
        $elapsed = (int) max(0, Carbon::now()->getTimestamp() - $startedTimestamp);

        if ($elapsed < $minSeconds) {
            $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);

            Log::warning("Anti-Bypass Triggered: User #{$user->id} completed link in {$elapsed}s (required {$minSeconds}s)", [
                'user_id'    => $user->id,
                'server_id'  => $renewal->server_id,
                'token'      => $token,
                'ip'         => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            throw new Exception("Anti-Bypass Alert: The link was completed in {$elapsed} seconds, which is impossibly fast without an automated bypass tool (minimum required is {$minSeconds}s). Linkvertise/Shrinkme bypassers are strictly prohibited. Please complete the link legitimately.");
        }

        $renewal->update([
            'status'      => ServerActivityRenewal::STATUS_VERIFIED,
            'verified_at' => Carbon::now(),
        ]);

        return [
            'success'      => true,
            'claim_code'   => $renewal->claim_code,
            'session_type' => $renewal->session_type,
            'step_number'  => $renewal->step_number,
            'status'       => ServerActivityRenewal::STATUS_VERIFIED,
            'server_id'    => $renewal->server_id,
        ];
    }

    /**
     * Claim code for active renewal or suspended reactivation step.
     *
     * @throws Exception
     */
    public function claimCode(Server $server, User $user, string $code): array
    {
        if ($server->user_id !== $user->id) {
            throw new Exception('Unauthorized: You do not own this server.');
        }

        if ($server->hasPaidTier()) {
            throw new Exception('Paid servers do not require free activity claims.');
        }

        $cleanCode = strtoupper(trim($code));

        /** @var ServerActivityRenewal $renewal */
        $renewal = ServerActivityRenewal::where('server_id', $server->id)
            ->where('user_id', $user->id)
            ->where('claim_code', $cleanCode)
            ->first();

        if (!$renewal) {
            throw new Exception('Invalid claim code. Please check the code and try again.');
        }

        if ($renewal->status === ServerActivityRenewal::STATUS_CLAIMED) {
            throw new Exception('This claim code has already been used.');
        }

        if ($renewal->status === ServerActivityRenewal::STATUS_BYPASSED_REJECTED) {
            throw new Exception('This code was invalidated due to automated bypass detection.');
        }

        if ($renewal->isExpired()) {
            throw new Exception('This claim session has expired. Please generate a new link.');
        }

        // Check if token was verified or bypass-checked
        if ($renewal->status === ServerActivityRenewal::STATUS_PENDING) {
            $minSeconds = (int) (DB::table('settings')->where('key', 'shrinkme_min_seconds')->value('value')
                ?: config('services.shrinkme.min_seconds', 20));
            $startedTimestamp = Carbon::parse($renewal->started_at)->getTimestamp();
            $elapsed = (int) max(0, Carbon::now()->getTimestamp() - $startedTimestamp);
            if ($elapsed < $minSeconds) {
                $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);
                throw new Exception("Anti-Bypass Alert: Link resolved too quickly ({$elapsed}s). Bypasser tools are rejected.");
            }
        }

        return DB::transaction(function () use ($server, $user, $renewal) {
            // Lock server row for atomic update
            $freshServer = Server::lockForUpdate()->findOrFail($server->id);

            $renewal->update([
                'status'     => ServerActivityRenewal::STATUS_CLAIMED,
                'claimed_at' => Carbon::now(),
            ]);

            // Branch A: Active Server Renewal (1 link = 1 code)
            if (!$freshServer->isSuspended()) {
                $freshServer->activity_expires_at = Carbon::now()->addHours(72);
                $freshServer->expires_at          = Carbon::now()->addHours(72);
                $freshServer->save();

                try {
                    \Convoy\Facades\Activity::event('server:activity-renew')
                        ->actor($user)
                        ->subject($freshServer)
                        ->description("Renewed free VPS '{$freshServer->name}' for 72 hours via sponsored link check-in")
                        ->property(['activity_expires_at' => (string) $freshServer->activity_expires_at])
                        ->withRequestMetadata()
                        ->log();
                } catch (\Throwable $e) {}

                return [
                    'restored'         => true,
                    'is_suspended'     => false,
                    'lifecycle_phase'  => $freshServer->getActivityLifecyclePhase(),
                    'activity_expires' => $freshServer->activity_expires_at->toIso8601String(),
                    'message'          => "Server '{$freshServer->name}' renewed! Exactly 72 hours (3 days) added to your activity timer.",
                ];
            }

            // Branch B: Suspended Server Reactivation (3 sequential links: 1/3 -> 2/3 -> 3/3)
            $completed = (int) $freshServer->reactivation_codes_completed + 1;
            $freshServer->reactivation_codes_completed = min(3, $completed);

            if ($completed < 3) {
                $freshServer->save();
                $remaining = 3 - $completed;
                $nextStep  = $completed + 1;

                try {
                    \Convoy\Facades\Activity::event('server:reactivation-step')
                        ->actor($user)
                        ->subject($freshServer)
                        ->description("Verified claim code {$completed}/3 for suspended VPS '{$freshServer->name}'")
                        ->property(['progress' => "{$completed}/3"])
                        ->withRequestMetadata()
                        ->log();
                } catch (\Throwable $e) {}

                return [
                    'restored'         => false,
                    'is_suspended'     => true,
                    'step_completed'   => $completed,
                    'required'         => 3,
                    'remaining'        => $remaining,
                    'next_step'        => $nextStep,
                    'progress_display' => "{$completed}/3",
                    'lifecycle_phase'  => $freshServer->getActivityLifecyclePhase(),
                    'message'          => "Code {$completed}/3 verified! Complete Link {$nextStep} of 3 to restore your server.",
                ];
            }

            // Step 3/3 reached: Unsuspend and power VM back on
            $freshServer->status                       = null;
            $freshServer->suspended_at                 = null;
            $freshServer->deletion_deadline_at         = null;
            $freshServer->reactivation_codes_completed = 0;
            $freshServer->activity_expires_at          = Carbon::now()->addHours(72);
            $freshServer->expires_at                   = Carbon::now()->addHours(72);
            $freshServer->save();

            try {
                $this->suspensionService->toggle($freshServer, SuspensionAction::UNSUSPEND);
            } catch (\Throwable $e) {
                Log::error("Failed to power on VM for server #{$freshServer->id} after unsuspend: " . $e->getMessage());
            }

            try {
                \Convoy\Facades\Activity::event('server:activity-unsuspend')
                    ->actor($user)
                    ->subject($freshServer)
                    ->description("Successfully completed all 3/3 links! Unsuspended and restarted VPS '{$freshServer->name}' (+72 hours)")
                    ->property(['activity_expires_at' => (string) $freshServer->activity_expires_at])
                    ->withRequestMetadata()
                    ->log();
            } catch (\Throwable $e) {}

            return [
                'restored'         => true,
                'is_suspended'     => false,
                'step_completed'   => 3,
                'required'         => 3,
                'progress_display' => '3/3',
                'lifecycle_phase'  => 'active',
                'activity_expires' => $freshServer->activity_expires_at->toIso8601String(),
                'message'          => "All 3 links verified! Server '{$freshServer->name}' has been unsuspended, booted online, and granted a fresh 72-hour timer.",
            ];
        });
    }

    /**
     * Fetch complete activity & countdown status for a server.
     */
    public function getStatus(Server $server): array
    {
        if ($server->hasPaidTier()) {
            return [
                'plan_tier'        => 'paid',
                'lifecycle_phase'  => 'paid',
                'is_suspended'     => false,
                'requires_renewal' => false,
            ];
        }

        $nowTs = Carbon::now()->getTimestamp();
        $isSuspended = $server->isSuspended();
        $phase = $server->getActivityLifecyclePhase();

        $activeRemainingSeconds = 0;
        if ($server->activity_expires_at) {
            $activeRemainingSeconds = (int) max(0, Carbon::parse($server->activity_expires_at)->getTimestamp() - $nowTs);
        }

        $preSuspendCriticalSeconds = 0;
        if ($server->isInPreSuspendCritical()) {
            $suspendAt = Carbon::parse($server->activity_expires_at)->addMinutes(30);
            $preSuspendCriticalSeconds = (int) max(0, $suspendAt->getTimestamp() - $nowTs);
        }

        $suspendedRemainingSeconds = 0;
        $preDeleteCriticalSeconds = 0;
        if ($isSuspended && $server->deletion_deadline_at) {
            $deadline = Carbon::parse($server->deletion_deadline_at);
            $suspendedRemainingSeconds = (int) max(0, $deadline->getTimestamp() - $nowTs);
            if ($server->isInPreDeletionCritical()) {
                $preDeleteCriticalSeconds = $suspendedRemainingSeconds;
            }
        }

        return [
            'plan_tier'                     => 'free',
            'lifecycle_phase'               => $phase,
            'is_suspended'                  => $isSuspended,
            'activity_expires_at'           => $server->activity_expires_at?->toIso8601String(),
            'deletion_deadline_at'          => $server->deletion_deadline_at?->toIso8601String(),
            'active_remaining_seconds'      => $activeRemainingSeconds,
            'pre_suspend_critical_seconds'  => $preSuspendCriticalSeconds,
            'suspended_remaining_seconds'   => $suspendedRemainingSeconds,
            'pre_delete_critical_seconds'   => $preDeleteCriticalSeconds,
            'reactivation_progress'         => $server->getReactivationProgress(),
        ];
    }
}
