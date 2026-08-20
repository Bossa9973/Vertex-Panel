import http from '@/api/http'

export interface ResetPvePasswordPayload {
    password: string
    userid?: string
}

export interface ResetPvePasswordResponse {
    success: boolean
    message: string
}

const resetRootPassword = async (
    nodeId: number,
    payload: ResetPvePasswordPayload
): Promise<ResetPvePasswordResponse> => {
    const { data } = await http.post<ResetPvePasswordResponse>(
        `/api/admin/nodes/${nodeId}/reset-root-password`,
        payload
    )
    return data
}

export default resetRootPassword
