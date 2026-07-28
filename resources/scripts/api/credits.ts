import http from '@/api/http'

export interface CreditTransaction {
    id: number
    user_id: number
    amount: number
    type: 'topup' | 'bonus' | 'deduction' | 'refund'
    description: string
    reference_id: string | null
    created_at: string
    updated_at: string
}

export interface CreditsResponse {
    credits: number
    transactions: {
        data: CreditTransaction[]
        current_page: number
        last_page: number
        total: number
    }
}

export const getCredits = (): Promise<CreditsResponse> => {
    return http.get('/api/client/credits').then(res => res.data)
}

export const topUpCredits = (amount: number, paymentMethod?: string): Promise<{ success: boolean; credits: number; transaction: CreditTransaction; message: string }> => {
    return http.post('/api/client/credits/topup', {
        amount,
        payment_method: paymentMethod,
    }).then(res => res.data)
}
