import http from '@/api/http'

export interface CoinBalance {
    coin: 'USDT' | 'SOL' | 'BTC' | 'LTC' | 'ETH'
    balance: number
    locked_balance: number
    available_balance: number
}

export interface ResellerOverviewResponse {
    is_reseller: boolean
    balances: CoinBalance[]
    stats: {
        total_links: number
        paid_links: number
        total_withdrawals: number
        min_withdrawal_usd: number
    }
}

export interface ResellerPlanConfig {
    vps_plan_id: number
    name: string
    base_price: number
    cpu: number
    ram: number
    disk: number
    model_type: 'own_inventory' | 'zero_cost'
    markup_percent: number
    custom_price: number
    max_zero_cost_markup: number
    active: boolean
}

export interface PaymentLink {
    id: number
    uuid: string
    server_name: string
    model_type: 'own_inventory' | 'zero_cost'
    base_price: number
    selling_price: number
    markup_amount: number
    coin: string
    status: 'pending' | 'paid' | 'expired'
    paid_at?: string
    client?: {
        name: string
        email: string
    }
    server?: {
        id: number
        name: string
        uuid: string
    }
    created_at: string
}

export interface ResellerWithdrawal {
    id: number
    uuid: string
    coin: string
    amount: number
    wallet_address: string
    status: 'pending' | 'approved' | 'rejected'
    tx_hash?: string
    admin_notes?: string
    created_at: string
}

export const getResellerOverview = (): Promise<ResellerOverviewResponse> => {
    return http.get('/api/client/reseller/overview').then(res => res.data)
}

export const getResellerPlans = (): Promise<{ plans: ResellerPlanConfig[] }> => {
    return http.get('/api/client/reseller/plans').then(res => res.data)
}

export const saveResellerPlanMarkup = (data: {
    vps_plan_id: number
    model_type: 'own_inventory' | 'zero_cost'
    markup_percent: number
    custom_price: number
}): Promise<{ message: string }> => {
    return http.post('/api/client/reseller/plans', data).then(res => res.data)
}

export const getResellerPaymentLinks = (): Promise<{ links: { data: PaymentLink[] } }> => {
    return http.get('/api/client/reseller/links').then(res => res.data)
}

export const createResellerPaymentLink = (data: {
    vps_plan_id: number
    node_id: number
    template_uuid: string
    server_name: string
    coin: string
}): Promise<{ message: string; payment_link: PaymentLink; checkout_url: string }> => {
    return http.post('/api/client/reseller/links', data).then(res => res.data)
}

export const submitResellerWithdrawal = (data: {
    coin: string
    amount: number
    wallet_address: string
}): Promise<{ message: string; withdrawal: ResellerWithdrawal }> => {
    return http.post('/api/client/reseller/withdraw', data).then(res => res.data)
}

export const getResellerWithdrawals = (): Promise<{ withdrawals: { data: ResellerWithdrawal[] } }> => {
    return http.get('/api/client/reseller/withdrawals').then(res => res.data)
}

export const getPublicPaymentLinkDetails = (uuid: string): Promise<any> => {
    return http.get(`/api/client/pay/${uuid}`).then(res => res.data)
}

export const processPublicPaymentLink = (uuid: string, data: { account_password: string }): Promise<any> => {
    return http.post(`/api/client/pay/${uuid}`, data).then(res => res.data)
}
