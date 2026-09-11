import http from '@/api/http'

export interface ActivityRenewalSession {
    session_id: number
    token: string
    session_type: 'active_renewal' | 'reactivation_step'
    step_number: number
    shrinkme_url: string
    expires_in_seconds: number
    started_at: string
}

/**
 * Auto-grant result returned from verifyActivityCallback.
 * The renewal is now applied server-side — no claim code is returned.
 */
export interface ActivityVerificationResult {
    success: boolean
    auto_granted: boolean
    session_type: 'active_renewal' | 'reactivation_step'
    step_number: number
    status: string
    server_id: number
    // Grant details (set when auto_granted = true)
    restored?: boolean
    is_suspended?: boolean
    step_completed?: number
    required?: number
    remaining?: number
    next_step?: number
    progress_display?: string
    lifecycle_phase?: string
    activity_expires?: string
    message?: string
}

export interface ActivitySessionStatus {
    has_session: boolean
    session_id?: number
    status?: 'pending' | 'verified' | 'claimed' | 'bypassed_rejected' | 'expired'
    session_type?: 'active_renewal' | 'reactivation_step'
    step_number?: number
    is_claimed?: boolean
    is_expired?: boolean
}

export interface ActivityServerStatus {
    plan_tier: 'free' | 'paid'
    lifecycle_phase:
        | 'paid'
        | 'active'
        | 'pre_suspend_warning'
        | 'pre_suspend_critical'
        | 'suspended_recovery'
        | 'pre_delete_critical'
        | 'deleted'
    is_suspended: boolean
    activity_expires_at?: string | null
    deletion_deadline_at?: string | null
    active_remaining_seconds: number
    pre_suspend_critical_seconds: number
    suspended_remaining_seconds: number
    pre_delete_critical_seconds: number
    reactivation_progress: {
        completed: number
        required: number
        remaining: number
        display: string
    }
}

export interface HumanGesturePayload {
    is_trusted: boolean
    points: Array<[number, number, number]>
    is_touch?: boolean
}

/**
 * Start a renewal or reactivation link session for a free server.
 */
export const startServerActivitySession = async (
    serverId: number,
    clientNonce?: string
): Promise<ActivityRenewalSession> => {
    const res = await http.post(`/api/client/servers/${serverId}/activity/start`, {
        client_nonce: clientNonce,
    })
    return res.data.data
}

/**
 * Verify token callback with 6-pillar Anti-Bypass checks.
 * On success, the server renewal is AUTO-GRANTED — no claim code is returned.
 * The dashboard polls sessionStatus() to detect completion.
 */
export const verifyActivityCallback = async (
    session: string,
    sig: string,
    clientNonce?: string,
    gesture?: HumanGesturePayload,
    clientIntegrity?: string
): Promise<ActivityVerificationResult> => {
    const res = await http.post('/api/client/activity/verify', {
        session,
        sig,
        client_nonce: clientNonce,
        gesture,
        client_integrity: clientIntegrity,
    })
    return res.data.data
}

/**
 * Poll the status of the most recent renewal session for a server.
 * Returns is_claimed=true once the landing page verification has completed and the grant was applied.
 */
export const getServerSessionStatus = async (serverId: number): Promise<ActivitySessionStatus> => {
    const res = await http.get(`/api/client/servers/${serverId}/activity/session-status`)
    return res.data.data
}

/**
 * Fetch real-time activity and recovery countdowns for a server.
 */
export const getServerActivityStatus = async (serverId: number): Promise<ActivityServerStatus> => {
    const res = await http.get(`/api/client/servers/${serverId}/activity/status`)
    return res.data.data
}

/**
 * Landing ping — call this immediately on mount in ActivityClaimPage.
 *
 * At the moment the claim page loads the browser Referer is still shrinkme.io
 * (set by the redirect chain). This stamps shrinkme_landed_at on the session row
 * so verifyCallback can verify the Shrinkme gate server-side.
 *
 * If the user arrived via a bypass tool (direct URL), the server will burn the
 * session immediately and this will throw — show an error and block the verify button.
 */
export const pingActivityLanding = async (
    session: string,
    sig: string
): Promise<{ landed: boolean; already_consumed?: boolean }> => {
    const res = await http.post('/api/client/activity/landing-ping', { session, sig })
    return res.data.data
}
