import http from '@/api/http'

export interface SpendingTransaction {
    id: number
    amount: number
    type: string
    description: string | null
    reference_id: string | null
    created_at: string | null
    timestamp: number
}

export interface PromoCodeRecord {
    code: string
    amount: number
    used: boolean
    used_at: string | null
    created_by_discord_id: string | null
    reason: string
    created_at: string | null
    timestamp: number
}

export interface OwnedServer {
    id: number
    uuid: string
    uuid_short: string
    vmid: number
    name: string
    hostname: string
    status: string // 'in_use' | 'installing' | 'suspended' | 'expired' | 'deleting'
    node_id: number
    node_name: string
    ip: string
    memory_mb: number
    cpu_cores: number
    disk_mb: number
    description: string | null
    expires_at: string | null
    created_at: string | null
}

export interface ServerLifecycleEvent {
    id: number
    event: string
    description: string
    status_badge: string // 'In Use' | 'Deleted' | 'Suspended' | 'Expired' | 'Installing' | 'Deployed' | 'Renewed' | 'Rebooted'
    ip?: string
    server_name?: string
    vmid?: number
    plan_name?: string
    node_name?: string
    cost?: number
    properties?: Record<string, any>
    created_at: string | null
    timestamp: number
}

export interface DiscordStatsData {
    discord_id: string | null
    stats: {
        messages: number
        boosts: number
    } | null
    invites: {
        joined: number
        left: number
        fake: number
        valid: number
    }
}

export interface UserHistoryData {
    user: {
        id: number
        name: string
        email: string
        discord_id: string | null
        discord_username: string | null
        google_email: string | null
        credits: number
        root_admin: boolean
        created_at: string | null
    }
    balance: number
    summary: {
        current_balance: number
        total_spent: number
        total_deposited: number
        total_bonus: number
        total_promo_claimed: number
        total_promo_generated: number
        active_servers: number
        total_servers_lifetime: number
        total_transactions: number
        total_promo_codes_issued: number
        total_server_events: number
    }
    spending_history: SpendingTransaction[]
    promo_history: PromoCodeRecord[]
    owned_servers: OwnedServer[]
    server_history: ServerLifecycleEvent[]
    discord: DiscordStatsData
}

export interface UserHistoryListItem {
    id: number
    name: string
    email: string
    discord_id: string | null
    discord_username: string | null
    credits: number
    root_admin: boolean
    servers_count: number
    created_at: string | null
}

export interface TransactionServerInfo {
    server_exists: boolean
    id?: number
    uuid?: string
    uuid_short?: string
    vmid?: number
    name: string
    hostname?: string
    status: string
    node_name?: string
    node_ip?: string
    ip_address?: string
    cpu_cores?: number
    memory_mb?: number
    disk_mb?: number
    plan_name?: string
    description?: string | null
    server_created_at?: string | null
    server_expires_at?: string | null
    server_deleted_at?: string | null
    is_expired?: boolean
    price_when_bought?: number
}

export interface TransactionDetailsData {
    ok: boolean
    transaction: {
        id: number
        reference_id: string
        amount: number
        type: string
        description: string | null
        created_at: string | null
        timestamp: number
    }
    user: {
        id: number
        name: string
        email: string
        discord_id: string | null
        discord_username: string | null
        credits: number
        root_admin: boolean
        created_at: string | null
    } | null
    server: TransactionServerInfo | null
    promo: PromoCodeRecord | null
    lifecycle: Array<{
        event: string
        description: string
        ip: string
        properties: Record<string, any>
        timestamp: string | null
    }>
}

export const getUserHistory = async (userId: number): Promise<UserHistoryData> => {
    const { data } = await http.get(`/api/admin/users/${userId}/history`)
    return data
}

export const getUserHistoryList = async (search = '', page = 1, perPage = 50): Promise<{ data: UserHistoryListItem[]; pagination: any }> => {
    const { data } = await http.get('/api/admin/user-history', {
        params: { search, page, per_page: perPage }
    })
    return data
}

export const getTransactionDetails = async (identifier: string): Promise<TransactionDetailsData> => {
    const { data } = await http.get(`/api/admin/transactions/${encodeURIComponent(identifier)}`)
    return data
}
