import http from '@/api/http'

export interface PterodactylDeployPayload {
    cf_tunnel_token: string
    panel_fqdn: string
    wings_fqdn: string
    admin_email: string
    admin_username: string
    admin_firstname: string
    admin_lastname: string
    admin_password?: string
    db_password?: string
    timezone?: string
    node_name: string
    node_memory: number
    node_disk: number
    location_short: string
}

export interface PterodactylDeployStatus {
    status: 'pending' | 'provisioning' | 'installing' | 'complete' | 'failed'
    panel_fqdn: string | null
    wings_fqdn: string | null
    error: string | null
    credentials?: {
        panel_url: string
        admin_email: string
        admin_password: string
        node_id: number
        node_status: string
    }
}

/**
 * Submit a new Pterodactyl deploy order.
 * Returns { deploy_id: number }
 */
export const submitPterodactylDeploy = (
    payload: PterodactylDeployPayload
): Promise<{ deploy_id: number }> => {
    return http
        .post('/api/client/deploy/pterodactyl', payload)
        .then(res => res.data)
}

/**
 * Poll deploy status. Returns credentials only when status === 'complete'.
 */
export const getPterodactylDeployStatus = (
    deployId: number
): Promise<PterodactylDeployStatus> => {
    return http
        .get(`/api/client/deploy/pterodactyl/${deployId}`)
        .then(res => res.data)
}
