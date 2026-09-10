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

export interface ActivityVerificationResult {
    success: boolean
    claim_code: string
    session_type: 'active_renewal' | 'reactivation_step'
    step_number: number
    status: string
    server_id: number
}

export interface ActivityClaimResult {
    restored: boolean
    is_suspended: boolean
    step_completed?: number
    required?: number
    remaining?: number
    next_step?: number
    progress_display?: string
    lifecycle_phase?: string
    activity_expires?: string
    message: string
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
 * Verify token callback with 5-pillar Anti-Bypass checks (Two-tab handshake, physical gesture, integrity).
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
 * Submit claim code to extend active timer or advance suspended recovery step.
 */
export const claimActivityCode = async (serverId: number, code: string): Promise<ActivityClaimResult> => {
    const res = await http.post(`/api/client/servers/${serverId}/activity/claim-code`, { code })
    return res.data.data
}

/**
 * Fetch real-time activity and recovery countdowns for a server.
 */
export const getServerActivityStatus = async (serverId: number): Promise<ActivityServerStatus> => {
    const res = await http.get(`/api/client/servers/${serverId}/activity/status`)
    return res.data.data
}
