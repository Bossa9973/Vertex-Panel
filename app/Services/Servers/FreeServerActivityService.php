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
     * Start session proxy for backwards-compatibility.
     *
     * @throws Exception
     */
    public function startSession(Server $server, User $user, Request $request, ?string $clientNonce = null): array
    {
        return $this->startRenewalSession($server, $user, $request, $clientNonce);
    }

    /**
     * Start a new activity renewal session.
     * Generates a single-use token and contacts Shrinkme. No claim code is generated —
     * the renewal is granted automatically when the user lands and passes all security checks.
     *
     * @throws Exception
     */
    public function startRenewalSession(Server $server, User $user, Request $request, ?string $clientNonce = null): array
    {
        if ($server->user_id !== $user->id) {
            throw new Exception('Unauthorized: You do not own this server.');
        }

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

        $clientNonceHash = !empty($clientNonce) ? hash('sha256', $clientNonce) : null;

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
            if ($clientNonceHash && empty($recent->client_nonce_hash)) {
                $recent->update(['client_nonce_hash' => $clientNonceHash]);
            }

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

        $token = Str::random(48);
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
            'server_id'         => $server->id,
            'user_id'           => $user->id,
            'session_type'      => $sessionType,
            'step_number'       => $stepNumber,
            'token'             => $token,
            'client_nonce_hash' => $clientNonceHash,
            'shrinkme_url'      => $shortUrl,
            'destination_url'   => $destinationUrl,
            'status'            => ServerActivityRenewal::STATUS_PENDING,
            'ip_address'        => $request->ip(),
            'user_agent'        => substr((string) $request->userAgent(), 0, 500),
            'started_at'        => Carbon::now(),
            'expires_at'        => Carbon::now()->addMinutes(15),
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
     * Verify landing callback and — if all security pillars pass — directly grant the renewal.
     * No claim code is returned. The dashboard polls getStatus() to detect completion.
     *
     * Security Pillars:
     *   1. Two-Tab Active Browser Handshake (client_nonce)
     *   2. Hardware Physical Interaction (isTrusted + cursor trajectory)
     *   3. Known Bypass Source Referer Blacklist
     *   4. Datacenter / Cloud Proxy ASN Blocker
     *   5. Browser Client Integrity (webdriver / headless)
     *   6. Shrinkme Referrer Gate — request MUST originate from shrinkme.io (unless Shrinkme is disabled)
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

        if ($renewal->status === ServerActivityRenewal::STATUS_CLAIMED) {
            throw new Exception('Security Error: This verification link has already been used and claimed. Links are strictly single-use.');
        }

        if ($renewal->status === ServerActivityRenewal::STATUS_BYPASSED_REJECTED) {
            throw new Exception('Security Error: This verification link was flagged and burned. Please start a new link from your dashboard.');
        }

        if ($renewal->isExpired()) {
            $renewal->update(['status' => ServerActivityRenewal::STATUS_EXPIRED]);
            throw new Exception('Security Error: This verification link has expired (15-minute window exceeded). Please start a new link.');
        }

        // Already granted — idempotent re-load safe response
        if ($renewal->status === ServerActivityRenewal::STATUS_CLAIMED) {
            return [
                'success'      => true,
                'auto_granted' => true,
                'session_type' => $renewal->session_type,
                'step_number'  => $renewal->step_number,
                'status'       => ServerActivityRenewal::STATUS_CLAIMED,
                'server_id'    => $renewal->server_id,
            ];
        }

        // Pillar 1: Two-Tab Active Browser Handshake (Client Nonce Check)
        if (!empty($renewal->client_nonce_hash)) {
            $clientNonce = $request->input('client_nonce');
            if (empty($clientNonce) || !hash_equals($renewal->client_nonce_hash, hash('sha256', (string) $clientNonce))) {
                $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);
                Log::warning("Anti-Bypass: Client nonce handshake failed for user #{$user->id}");
                throw new Exception('Verification Failed: Active browser session handshake failed. Links must be completed from the dashboard session where they originated.');
            }
        }

        // Pillar 2: Hardware Physical Interaction Check (isTrusted & Cursor Trajectory)
        $gesture = $request->input('gesture');
        if (is_array($gesture)) {
            if (empty($gesture['is_trusted'])) {
                $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);
                Log::warning("Anti-Bypass: Synthetic isTrusted=false click detected for user #{$user->id}");
                throw new Exception('Verification Failed: Hardware interaction validation failed. Synthetic clicks and automated userscripts are prohibited.');
            }

            $points = $gesture['points'] ?? [];
            if (!is_array($points) || count($points) < 4) {
                $isTouch = !empty($gesture['is_touch']);
                if (!$isTouch) {
                    $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);
                    Log::warning("Anti-Bypass: Insufficient cursor trajectory points (" . count($points) . ") for user #{$user->id}");
                    throw new Exception('Verification Failed: Physical interaction validation failed. Automated scripts are prohibited.');
                }
            }
        }

        // Pillar 3: Referer / Known Bypass Source Blocking
        $referer = strtolower((string) $request->header('referer', ''));
        $blacklistedReferers = [
            'bypass.city', 'thebypasser', 'linkvertise-bypass', 'sub2unlock',
            'greasyfork', 'tampermonkey', 'violentmonkey', 'free-bypasser',
            'bypass-links', 'direct-link', 'adlinkfly-bypass', 'bypasser',
        ];
        foreach ($blacklistedReferers as $blocked) {
            if (str_contains($referer, $blocked)) {
                $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);
                Log::warning("Anti-Bypass Triggered: Blacklisted referer '{$referer}' for user #{$user->id}");
                throw new Exception('Verification Failed: Security integrity validation failed. Bypasser sources are strictly prohibited.');
            }
        }

        // Pillar 4: Datacenter & Cloud Proxy ASN / Reverse DNS Inspection
        $ip = $request->ip();
        if ($ip && !in_array($ip, ['127.0.0.1', '::1', 'localhost'])) {
            $host = @gethostbyaddr($ip);
            if ($host && $host !== $ip) {
                $cloudKeywords = ['hetzner', 'ovh', 'digitalocean', 'amazonaws', 'googleusercontent', 'linode', 'oracle', 'vultr', 'contabo', 'leaseweb'];
                $lowerHost = strtolower($host);
                foreach ($cloudKeywords as $kw) {
                    if (str_contains($lowerHost, $kw)) {
                        $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);
                        Log::warning("Anti-Bypass: Cloud datacenter IP rejected ({$ip} -> {$host}) for user #{$user->id}");
                        throw new Exception('Verification Failed: Security integrity validation failed. Datacenter proxies and automated scraping servers are prohibited.');
                    }
                }
            }
        }

        // Pillar 5: Browser Client Integrity (Webdriver / Headless Detection)
        $clientIntegrity = $request->input('client_integrity');
        if ($clientIntegrity) {
            try {
                $decoded = json_decode(base64_decode($clientIntegrity), true);
                if (is_array($decoded)) {
                    if (!empty($decoded['bot'])) {
                        $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);
                        Log::warning("Anti-Bypass Triggered: Webdriver bot detected for user #{$user->id}");
                        throw new Exception('Verification Failed: Automated browser environments are prohibited.');
                    }
                    if (isset($decoded['w']) && isset($decoded['h']) && ($decoded['w'] <= 0 || $decoded['h'] <= 0)) {
                        $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);
                        throw new Exception('Verification Failed: Headless browser environment detected.');
                    }
                }
            } catch (\Throwable $e) {
                if (str_starts_with($e->getMessage(), 'Verification Failed:')) {
                    throw $e;
                }
            }
        }

        // Minimal Sanity Floor (5 seconds) — prevent microsecond spam attacks
        $startedTimestamp = Carbon::parse($renewal->started_at)->getTimestamp();
        $elapsed = (int) max(0, Carbon::now()->getTimestamp() - $startedTimestamp);
        if ($elapsed < 5) {
            $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);
            throw new Exception('Verification Failed: Security integrity validation failed.');
        }

        // ─── Pillar 6: Shrinkme Referrer Gate ────────────────────────────────────────
        // The HTTP Referer header on the verify call must originate from shrinkme.io.
        // bypass.city resolves our destination URL server-side and hands it to the user.
        // When the user then opens the URL directly, their browser's Referer header will
        // be "bypass.city" or blank — never shrinkme.io — so we reject.
        //
        // We skip this check only when Shrinkme is explicitly disabled in settings,
        // in which case the two-tab client_nonce handshake (Pillar 1) is the primary gate.
        $shrinkmeEnabled = DB::table('settings')->where('key', 'shrinkme_enabled')->value('value');
        $shrinkmeActive  = ($shrinkmeEnabled !== 'false' && $shrinkmeEnabled !== '0');
        $shrinkmeApiKey  = DB::table('settings')->where('key', 'shrinkme_api_key')->value('value')
            ?: config('services.shrinkme.api_key', '');

        if ($shrinkmeActive && !empty($shrinkmeApiKey)) {
            $referer = strtolower((string) $request->header('referer', ''));
            $isFromShrinkme = str_contains($referer, 'shrinkme.');
            $isFromPanel    = str_contains($referer, strtolower(rtrim(config('app.url', ''), '/')));

            if (!$isFromShrinkme && !$isFromPanel) {
                $renewal->update([
                    'status'        => ServerActivityRenewal::STATUS_BYPASSED_REJECTED,
                    'claim_referer' => substr($referer, 0, 512),
                ]);
                Log::warning("Anti-Bypass [Pillar 6 Shrinkme Gate]: Invalid referer '{$referer}' for user #{$user->id} session {$renewal->id}");
                throw new Exception('Verification Failed: Security integrity validation failed. Please open the link through the dashboard.');
            }

            // Store referer for audit
            $renewal->claim_referer = substr($referer, 0, 512);
        }

        // ─── All pillars passed — directly grant the renewal ──────────────────────────
        // Mark verified first so we can safely hand off to the grant logic
        $renewal->update([
            'status'      => ServerActivityRenewal::STATUS_VERIFIED,
            'verified_at' => Carbon::now(),
        ]);

        // Retrieve the server and execute the grant inside an atomic transaction
        $server = Server::findOrFail($renewal->server_id);
        $result = $this->executeGrant($renewal, $server, $user);

        return array_merge(['success' => true, 'auto_granted' => true], $result);
    }

    /**
     * Execute the renewal grant atomically (shared by verifyCallback auto-grant path).
     * Locks both the renewal row and the server row to prevent double-granting.
     *
     * @throws Exception
     */
    protected function executeGrant(ServerActivityRenewal $renewal, Server $server, User $user): array
    {
        return DB::transaction(function () use ($renewal, $server, $user) {
            $freshRenewal = ServerActivityRenewal::lockForUpdate()->findOrFail($renewal->id);
            if ($freshRenewal->status === ServerActivityRenewal::STATUS_CLAIMED) {
                // Already granted in a concurrent request — return idempotent success
                return [
                    'already_claimed' => true,
                    'session_type'    => $freshRenewal->session_type,
                    'step_number'     => $freshRenewal->step_number,
                    'server_id'       => $freshRenewal->server_id,
                ];
            }
            if ($freshRenewal->status === ServerActivityRenewal::STATUS_BYPASSED_REJECTED) {
                throw new Exception('Verification Failed: Security integrity validation failed.');
            }

            $freshServer = Server::lockForUpdate()->findOrFail($server->id);

            $freshRenewal->update([
                'status'     => ServerActivityRenewal::STATUS_CLAIMED,
                'claimed_at' => Carbon::now(),
            ]);

            // Branch A: Active server renewal
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
                    'session_type'     => $freshRenewal->session_type,
                    'step_number'      => $freshRenewal->step_number,
                    'server_id'        => $freshServer->id,
                    'lifecycle_phase'  => $freshServer->getActivityLifecyclePhase(),
                    'activity_expires' => $freshServer->activity_expires_at->toIso8601String(),
                    'message'          => "Server '{$freshServer->name}' renewed for another 72 hours!",
                ];
            }

            // Branch B: Suspended server reactivation (3 sequential links)
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
                        ->description("Verified link {$completed}/3 for suspended VPS '{$freshServer->name}'")
                        ->property(['progress' => "{$completed}/3"])
                        ->withRequestMetadata()
                        ->log();
                } catch (\Throwable $e) {}

                return [
                    'restored'         => false,
                    'is_suspended'     => true,
                    'session_type'     => $freshRenewal->session_type,
                    'step_completed'   => $completed,
                    'step_number'      => $freshRenewal->step_number,
                    'server_id'        => $freshServer->id,
                    'required'         => 3,
                    'remaining'        => $remaining,
                    'next_step'        => $nextStep,
                    'progress_display' => "{$completed}/3",
                    'lifecycle_phase'  => $freshServer->getActivityLifecyclePhase(),
                    'message'          => "Step {$completed}/3 complete! Open Link {$nextStep} to continue.",
                ];
            }

            // All 3/3 complete — unsuspend
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
                    ->description("Completed all 3/3 links — unsuspended and restarted VPS '{$freshServer->name}' (+72h)")
                    ->property(['activity_expires_at' => (string) $freshServer->activity_expires_at])
                    ->withRequestMetadata()
                    ->log();
            } catch (\Throwable $e) {}

            return [
                'restored'         => true,
                'is_suspended'     => false,
                'session_type'     => $freshRenewal->session_type,
                'step_completed'   => 3,
                'step_number'      => $freshRenewal->step_number,
                'server_id'        => $freshServer->id,
                'required'         => 3,
                'progress_display' => '3/3',
                'lifecycle_phase'  => $freshServer->getActivityLifecyclePhase(),
                'activity_expires' => $freshServer->activity_expires_at->toIso8601String(),
                'message'          => "All 3/3 complete! Server '{$freshServer->name}' has been restored.",
            ];
        });
    }

    /**
     * @deprecated Manual claim codes are removed. Renewals are now auto-granted on landing.
     *             This method is kept as a no-op stub so old API calls return a clear error.
     */
    public function claimCode(Server $server, User $user, string $code): array
    {
        throw new Exception('Manual claim codes have been removed. Your server is renewed automatically when you complete the sponsored link.');
    }

    /**
     * Lightweight poll endpoint: returns the status of the most recent pending-or-claimed
     * renewal session for this server, so the dashboard can detect completion without polling getStatus.
     */
    public function getActiveSessionStatus(Server $server, User $user): array
    {
        $renewal = ServerActivityRenewal::where('server_id', $server->id)
            ->where('user_id', $user->id)
            ->whereIn('status', [
                ServerActivityRenewal::STATUS_PENDING,
                ServerActivityRenewal::STATUS_VERIFIED,
                ServerActivityRenewal::STATUS_CLAIMED,
            ])
            ->orderByDesc('started_at')
            ->first();

        if (!$renewal) {
            return ['has_session' => false];
        }

        return [
            'has_session'  => true,
            'session_id'   => $renewal->id,
            'status'       => $renewal->status,
            'session_type' => $renewal->session_type,
            'step_number'  => $renewal->step_number,
            'is_claimed'   => $renewal->status === ServerActivityRenewal::STATUS_CLAIMED,
            'is_expired'   => $renewal->isExpired(),
        ];
    }

    // ──────────────────────────────────────────────────────────────────────────────────
    // Legacy stub — originally returned claimCode grant details, kept for partial compat
    // ──────────────────────────────────────────────────────────────────────────────────
    protected function _legacyGrantPlaceholder(): void
    {
        // Intentionally empty.
        // The old grant logic is now in executeGrant().
        // The old claimCode() arguments were:
        //   'restored', 'is_suspended', 'step_completed', 'required', 'progress_display',
        //   'lifecycle_phase', 'activity_expires', 'message'
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
