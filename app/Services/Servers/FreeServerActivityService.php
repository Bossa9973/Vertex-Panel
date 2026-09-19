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
     * Record that the user's browser genuinely landed on the claim page from Shrinkme.
     *
     * Called by POST /activity/landing-ping immediately on page mount — at that
     * moment the browser's Referer header is still set to shrinkme.io (or its
     * redirect chain). We stamp shrinkme_landed_at so verifyCallback can require
     * it as proof-of-Shrinkme instead of the broken Referer-of-POST approach.
     *
     * When Shrinkme is disabled in settings this is a no-op stamp (always succeeds)
     * so the rest of the flow is unaffected.
     *
     * @throws Exception
     */
    public function recordLanding(string $token, string $sig, User $user, Request $request): array
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

        if ($renewal->status !== ServerActivityRenewal::STATUS_PENDING) {
            // Session already consumed or burned — just return current state silently.
            return ['landed' => false, 'already_consumed' => true];
        }

        if ($renewal->isExpired()) {
            $renewal->update(['status' => ServerActivityRenewal::STATUS_EXPIRED]);
            throw new Exception('Security Error: This verification link has expired.');
        }

        $shrinkmeEnabled = DB::table('settings')->where('key', 'shrinkme_enabled')->value('value');
        $shrinkmeActive  = ($shrinkmeEnabled !== 'false' && $shrinkmeEnabled !== '0');
        $shrinkmeApiKey  = DB::table('settings')->where('key', 'shrinkme_api_key')->value('value')
            ?: config('services.shrinkme.api_key', '');

        if ($shrinkmeActive && !empty($shrinkmeApiKey)) {
            // Use the navigation_referrer sent from the frontend (document.referrer captured at page load).
            // The HTTP Referer header of this POST is always the panel domain — not shrinkme —
            // because by the time JS fires the ping, the "current page" is already /activity/claim.
            // document.referrer is the URL that navigated the browser here (i.e. the shrinkme redirect),
            // and is only spoofable from JS in the same origin, which is not the bypass attack vector.
            $navigationReferrer = strtolower((string) $request->input('navigation_referrer', ''));
            $httpReferer        = strtolower((string) $request->header('referer', ''));

            // Known bypass tool domains — reject only explicit bypasser referrers.
            // We do NOT reject on empty referrer because:
            //   - Many Shrinkme redirect hops use Referrer-Policy: no-referrer
            //   - Meta-refresh / JS location.replace() redirects also strip document.referrer
            //   - Mobile browsers and some privacy-focused browsers strip referrers by default
            // The authoritative check is Pillar 6 (shrinkme_landed_at stamp) in verifyCallback.
            // Here we only burn sessions that positively identify as a known bypass tool.
            $bypassDomains = [
                'bypass.city', 'thebypasser.com', 'linkvertise-bypass', 'sub2unlock',
                'bypass-links.com', 'adlinkfly-bypass', 'direct-bypass',
            ];
            $referrerToCheck = $navigationReferrer ?: $httpReferer;
            foreach ($bypassDomains as $bypassDomain) {
                if ($referrerToCheck && str_contains($referrerToCheck, $bypassDomain)) {
                    $renewal->update([
                        'status'        => ServerActivityRenewal::STATUS_BYPASSED_REJECTED,
                        'claim_referer' => substr($referrerToCheck, 0, 512),
                    ]);
                    Log::warning(
                        "Anti-Bypass [Landing Gate]: Known bypass tool referrer '{$referrerToCheck}' for user #{$user->id} session {$renewal->id}. " .
                        "Session burned."
                    );
                    throw new Exception(
                        'Verification Failed: Bypass tool access detected. ' .
                        'Please complete the sponsored link naturally from your dashboard.'
                    );
                }
            }
        }

        // Stamp the landing time — verifyCallback will check this instead of Referer.
        $renewal->update([
            'shrinkme_landed_at' => Carbon::now(),
            'claim_referer'      => substr(strtolower((string) $request->header('referer', '')), 0, 512),
        ]);

        return ['landed' => true];
    }

    /**
     * Verify landing callback and — if all security pillars pass — directly grant the renewal.
     * No claim code is returned. The dashboard polls getStatus() to detect completion.
     *
     * Security Pillars:
     *   1. Two-Tab Active Browser Handshake (client_nonce)
     *   2. Hardware Physical Interaction (isTrusted — synthetic click detection only; trajectory is logged but does not burn)
     *   3. [REMOVED] HTTP Referer check — the verify POST Referer is always the panel domain, never a bypass tool
     *   4. Datacenter / Cloud Proxy ASN Blocker (soft log only, does not burn)
     *   5. Browser Client Integrity (webdriver / headless)
     *   6. Shrinkme Landing Stamp Gate — shrinkme_landed_at must be set by recordLanding() (unless Shrinkme is disabled)
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
        // NOTE: We only hard-reject on isTrusted=false (definitive bot signal).
        // Trajectory point count is NOT used to burn sessions — many legitimate desktop
        // users click quickly without moving the mouse, causing consistent false positives.
        // Pillar 6 (shrinkme_landed_at) is the authoritative gate for human verification.
        $gesture = $request->input('gesture');
        if (is_array($gesture)) {
            if (empty($gesture['is_trusted'])) {
                $renewal->update(['status' => ServerActivityRenewal::STATUS_BYPASSED_REJECTED]);
                Log::warning("Anti-Bypass: Synthetic isTrusted=false click detected for user #{$user->id}");
                throw new Exception('Verification Failed: Hardware interaction validation failed. Synthetic clicks and automated userscripts are prohibited.');
            }

            // Log trajectory count for monitoring but do NOT burn sessions on low counts.
            $points = $gesture['points'] ?? [];
            $pointCount = is_array($points) ? count($points) : 0;
            if ($pointCount < 2 && empty($gesture['is_touch'])) {
                Log::info("Anti-Bypass [Pillar 2 Soft]: Low cursor trajectory ({$pointCount} pts) for user #{$user->id} — not burning, Pillar 6 is authoritative.");
            }
        }

        // Pillar 3: Referer / Known Bypass Source Blocking
        // NOTE: The HTTP Referer header on this verify POST is ALWAYS the panel domain
        // (e.g. https://panel.example.com/activity/claim?session=...) because the
        // request originates from within the SPA. It can never be a bypass tool URL.
        // Checking it here is noise and was causing false positives.
        // The authoritative bypass gate is Pillar 6 (shrinkme_landed_at stamp).
        // We intentionally skip this check and rely on the landing-ping gate instead.

        // Pillar 4: Datacenter & Cloud Proxy ASN / Reverse DNS Inspection
        // NOTE: We log suspicious IPs but do NOT burn the session here.
        // Many legitimate users are on ISPs/networks whose rDNS contains cloud provider keywords
        // (e.g. shared hosting ISPs, corporate networks, mobile carriers resolving via cloud infra).
        // Pillar 6 (shrinkme_landed_at) is the authoritative gate — burning here causes false positives.
        $ip = $request->ip();
        if ($ip && !in_array($ip, ['127.0.0.1', '::1', 'localhost'])) {
            $host = @gethostbyaddr($ip);
            if ($host && $host !== $ip) {
                $cloudKeywords = ['hetzner', 'ovh', 'digitalocean', 'amazonaws', 'googleusercontent', 'linode', 'oracle', 'vultr', 'contabo', 'leaseweb'];
                $lowerHost = strtolower($host);
                foreach ($cloudKeywords as $kw) {
                    if (str_contains($lowerHost, $kw)) {
                        Log::warning("Anti-Bypass [Pillar 4 - Soft]: Cloud-like rDNS detected ({$ip} -> {$host}) for user #{$user->id} — not burning session, Pillar 6 is authoritative.");
                        break;
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
        // Use shrinkme_landed_at if available (time user arrived at claim page),
        // otherwise fall back to started_at (time session was created).
        $floorBase = $renewal->shrinkme_landed_at
            ? Carbon::parse($renewal->shrinkme_landed_at)->getTimestamp()
            : Carbon::parse($renewal->started_at)->getTimestamp();
        $elapsed = (int) max(0, Carbon::now()->getTimestamp() - $floorBase);
        if ($elapsed < 5) {
            // Do NOT burn the session — a real human could just be fast on a short Shrinkme page.
            // Just throw without updating status so they can retry in a few seconds.
            throw new Exception('Verification Failed: Please wait a moment and try again.');
        }

        // ─── Pillar 6: Shrinkme Landing Stamp Gate ────────────────────────────────────
        // Instead of checking the Referer of the verify POST (which is always the
        // panel domain — trivially bypassable), we require that shrinkme_landed_at
        // was stamped by recordLanding() at page-load time, when the browser Referer
        // is still shrinkme.io. bypass.city / direct URL access never goes through
        // Shrinkme so the stamp is never set, and the session is rejected here.
        //
        // NOTE: $isFromPanel was intentionally REMOVED. Allowing panel-referer as a
        // fallback was the exact vector that let bypassed sessions through.
        $shrinkmeEnabled = DB::table('settings')->where('key', 'shrinkme_enabled')->value('value');
        $shrinkmeActive  = ($shrinkmeEnabled !== 'false' && $shrinkmeEnabled !== '0');
        $shrinkmeApiKey  = DB::table('settings')->where('key', 'shrinkme_api_key')->value('value')
            ?: config('services.shrinkme.api_key', '');

        if ($shrinkmeActive && !empty($shrinkmeApiKey)) {
            if (empty($renewal->shrinkme_landed_at)) {
                $renewal->update([
                    'status'        => ServerActivityRenewal::STATUS_BYPASSED_REJECTED,
                    'claim_referer' => substr(strtolower((string) $request->header('referer', '')), 0, 512),
                ]);
                Log::warning(
                    "Anti-Bypass [Pillar 6 Landing Stamp]: No shrinkme_landed_at for user #{$user->id} session {$renewal->id}. " .
                    "Direct URL access (bypass) detected — session burned."
                );
                throw new Exception(
                    'Verification Failed: Security integrity validation failed. ' .
                    'This link must be opened through the dashboard and completed via the sponsored page.'
                );
            }
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
