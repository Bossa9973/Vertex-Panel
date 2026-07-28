import http from '@/api/http'

export interface RegisterData {
    name: string
    email: string
    password: string
    password_confirmation: string
}

export default (data: RegisterData): Promise<any> => {
    return http.post('/auth/register', data)
}
