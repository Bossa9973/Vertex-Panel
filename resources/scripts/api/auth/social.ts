import http from '@/api/http'

export interface SocialLoginData {
    provider: 'google' | 'discord'
    email: string
    name?: string
}

export default (data: SocialLoginData): Promise<any> => {
    return http.post('/auth/social', data)
}
