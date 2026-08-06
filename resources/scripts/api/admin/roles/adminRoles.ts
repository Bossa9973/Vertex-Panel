import http from '@/api/http'

export interface AdminRole {
    id: number
    name: string
    color: string
    description: string | null
    permissions: string[]
    users_count: number
    created_at: string
}

export interface PermissionMeta {
    label: string
    section: string
    category: string
}

export interface AdminUser {
    id: number
    name: string
    email: string
    admin_role_id: number | null
    admin_role_name: string | null
    admin_role_color: string | null
    is_super_admin: boolean
    hide_ip_in_audit?: boolean
}

export const getRoles = (): Promise<AdminRole[]> =>
    http.get('/api/admin/roles').then(r => r.data.data)

export const getPermissions = (): Promise<Record<string, PermissionMeta>> =>
    http.get('/api/admin/roles/permissions').then(r => r.data.data)

export const getAdminUsers = (): Promise<AdminUser[]> =>
    http.get('/api/admin/roles/admin-users').then(r => r.data.data)

export const createRole = (data: {
    name: string
    color: string
    description?: string
    permissions: string[]
}): Promise<AdminRole> =>
    http.post('/api/admin/roles', data).then(r => r.data.data)

export const updateRole = (
    id: number,
    data: { name?: string; color?: string; description?: string; permissions?: string[] }
): Promise<AdminRole> =>
    http.put(`/api/admin/roles/${id}`, data).then(r => r.data.data)

export const deleteRole = (id: number): Promise<void> =>
    http.delete(`/api/admin/roles/${id}`)

export const assignRole = (userId: number, roleId: number | null): Promise<void> =>
    http.post('/api/admin/roles/assign', { user_id: userId, role_id: roleId })

export const toggleUserIpPrivacy = (userId: number, hideIp: boolean): Promise<void> =>
    http.post('/api/admin/roles/toggle-ip-privacy', { user_id: userId, hide_ip_in_audit: hideIp })
