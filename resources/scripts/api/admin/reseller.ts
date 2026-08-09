import http from '@/api/http'

export interface AdminResellerUser {
    id: number
    name: string
    email: string
    is_reseller: boolean
    reseller_notes?: string
    reseller_plan_type?: 'own_inventory' | 'zero_cost' | null
    coin_balances?: Array<{
        coin: string
        balance: number
        locked_balance: number
    }>
}

export interface AdminWithdrawalItem {
    id: number
    uuid: string
    user_id: number
    coin: string
    amount: number
    wallet_address: string
    status: 'pending' | 'approved' | 'rejected'
    tx_hash?: string
    admin_notes?: string
    created_at: string
    user?: {
        name: string
        email: string
    }
}

export const getAdminResellers = (params?: { resellers_only?: boolean; search?: string }): Promise<{ users: { data: AdminResellerUser[] } }> => {
    return http.get('/api/admin/resellers', { params }).then(res => res.data)
}

export const toggleAdminResellerStatus = (
    id: number,
    data: { is_reseller: boolean; reseller_notes?: string; plan_type?: 'own_inventory' | 'zero_cost' }
): Promise<{ message: string; user: any }> => {
    return http.post(`/api/admin/resellers/${id}/toggle-status`, data).then(res => res.data)
}

export const getAdminWithdrawals = (params?: { status?: string }): Promise<{ withdrawals: { data: AdminWithdrawalItem[] } }> => {
    return http.get('/api/admin/resellers/withdrawals', { params }).then(res => res.data)
}

export const approveAdminWithdrawal = (id: number, data: { tx_hash: string; admin_notes?: string }): Promise<{ message: string; withdrawal: AdminWithdrawalItem }> => {
    return http.post(`/api/admin/resellers/withdrawals/${id}/approve`, data).then(res => res.data)
}

export const rejectAdminWithdrawal = (id: number, data: { admin_notes: string }): Promise<{ message: string; withdrawal: AdminWithdrawalItem }> => {
    return http.post(`/api/admin/resellers/withdrawals/${id}/reject`, data).then(res => res.data)
}
