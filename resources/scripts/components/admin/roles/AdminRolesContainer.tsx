import { useEffect, useState } from 'react'
import { useStoreState } from '@/state'
import PageContentBlock from '@/components/elements/PageContentBlock'
import { Modal, LoadingOverlay } from '@mantine/core'
import {
    ShieldCheckIcon,
    PlusIcon,
    TrashIcon,
    PencilSquareIcon,
    UserGroupIcon,
    CheckBadgeIcon,
    XMarkIcon,
    UserCircleIcon,
    EyeIcon,
    EyeSlashIcon,
} from '@heroicons/react/24/outline'
import {
    getRoles,
    getPermissions,
    getAdminUsers,
    createRole,
    updateRole,
    deleteRole,
    assignRole,
    toggleUserIpPrivacy,
    type AdminRole,
    type PermissionMeta,
    type AdminUser,
} from '@/api/admin/roles/adminRoles'

// ─── Helpers ────────────────────────────────────────────────────────────────

const SUPER_ADMIN_EMAIL = 'ceo@vertexnodes.top'

function useIsCeo() {
    const email = useStoreState(s => s.user.data?.email)
    return email === SUPER_ADMIN_EMAIL
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const RoleBadge = ({ name, color }: { name: string; color: string }) => (
    <span
        className='inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border'
        style={{ color, borderColor: color + '55', backgroundColor: color + '15' }}
    >
        <span className='w-1.5 h-1.5 rounded-full' style={{ backgroundColor: color }} />
        {name}
    </span>
)

interface PermissionToggleProps {
    permKey: string
    meta: PermissionMeta
    checked: boolean
    onChange: (key: string, val: boolean) => void
    disabled?: boolean
}

const PermissionToggle = ({ permKey, meta, checked, onChange, disabled }: PermissionToggleProps) => (
    <label
        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
            disabled ? 'opacity-40 cursor-not-allowed' : ''
        } ${
            checked
                ? 'bg-blue-500/10 border-blue-500/40'
                : 'bg-neutral-900/60 border-white/8 hover:border-white/20'
        }`}
    >
        <input
            type='checkbox'
            checked={checked}
            disabled={disabled}
            onChange={e => !disabled && onChange(permKey, e.target.checked)}
            className='mt-0.5 accent-blue-500 h-4 w-4 shrink-0'
        />
        <div>
            <p className='text-xs font-bold text-white leading-tight'>{meta.label}</p>
            <p className='text-[10px] text-gray-400 mt-0.5'>{meta.section}</p>
        </div>
    </label>
)

// ─── Role form modal ─────────────────────────────────────────────────────────
interface RoleFormModalProps {
    opened: boolean
    onClose: () => void
    onSaved: () => void
    permissions: Record<string, PermissionMeta>
    editing: AdminRole | null
}

const PRESET_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
    '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#64748b',
]

const RoleFormModal = ({ opened, onClose, onSaved, permissions, editing }: RoleFormModalProps) => {
    const [name, setName] = useState('')
    const [color, setColor] = useState('#6366f1')
    const [description, setDescription] = useState('')
    const [selectedPerms, setSelectedPerms] = useState<string[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (editing) {
            setName(editing.name)
            setColor(editing.color)
            setDescription(editing.description ?? '')
            setSelectedPerms(editing.permissions)
        } else {
            setName('')
            setColor('#6366f1')
            setDescription('')
            setSelectedPerms([])
        }
        setError(null)
    }, [editing, opened])

    const togglePerm = (key: string, val: boolean) => {
        setSelectedPerms(prev => val ? [...prev, key] : prev.filter(p => p !== key))
    }

    const handleSubmit = async () => {
        if (!name.trim()) { setError('Role name is required.'); return }
        setSaving(true); setError(null)
        try {
            if (editing) {
                await updateRole(editing.id, { name, color, description, permissions: selectedPerms })
            } else {
                await createRole({ name, color, description, permissions: selectedPerms })
            }
            onSaved()
            onClose()
        } catch (e: any) {
            setError(e.response?.data?.message || 'Failed to save role.')
        } finally {
            setSaving(false)
        }
    }

    // Group permissions by category
    const grouped = Object.entries(permissions).reduce<Record<string, [string, PermissionMeta][]>>(
        (acc, entry) => {
            const cat = entry[1].category
            if (!acc[cat]) acc[cat] = []
            acc[cat].push(entry)
            return acc
        }, {}
    )

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={null}
            size='xl'
            centered
            withCloseButton={false}
            padding={0}
            radius={20}
            styles={{
                content: { backgroundColor: '#0a0c12', border: '1px solid rgba(255,255,255,0.08)' },
                body: { padding: 0 },
                overlay: { backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' },
            }}
        >
            <LoadingOverlay visible={saving} />
            <div className='p-6 md:p-8'>
                {/* Header */}
                <div className='flex items-center justify-between mb-6'>
                    <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl flex items-center justify-center' style={{ backgroundColor: color + '20', border: `1px solid ${color}55` }}>
                            <ShieldCheckIcon className='w-5 h-5' style={{ color }} />
                        </div>
                        <div>
                            <h2 className='text-lg font-extrabold text-white'>
                                {editing ? 'Edit Role' : 'Create New Role'}
                            </h2>
                            <p className='text-xs text-gray-400'>Configure name, colour and permissions</p>
                        </div>
                    </div>
                    <button onClick={onClose} className='w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-gray-400 hover:text-white transition cursor-pointer'>
                        <XMarkIcon className='w-4 h-4' />
                    </button>
                </div>

                {error && (
                    <div className='mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs'>
                        {error}
                    </div>
                )}

                {/* Name + Colour */}
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6'>
                    <div>
                        <label className='block text-xs font-bold text-gray-300 mb-1.5'>Role Name</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder='e.g. Support Staff'
                            className='w-full px-3.5 py-2.5 rounded-xl text-sm bg-neutral-900 border border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none transition'
                        />
                    </div>
                    <div>
                        <label className='block text-xs font-bold text-gray-300 mb-1.5'>Badge Colour</label>
                        <div className='flex flex-wrap gap-2 mt-1'>
                            {PRESET_COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    className='w-6 h-6 rounded-full transition-transform cursor-pointer'
                                    style={{
                                        backgroundColor: c,
                                        outline: color === c ? `2px solid ${c}` : 'none',
                                        outlineOffset: '2px',
                                        transform: color === c ? 'scale(1.2)' : 'scale(1)',
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className='mb-6'>
                    <label className='block text-xs font-bold text-gray-300 mb-1.5'>Description (optional)</label>
                    <input
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder='Short description of this role...'
                        className='w-full px-3.5 py-2.5 rounded-xl text-sm bg-neutral-900 border border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500 focus:outline-none transition'
                    />
                </div>

                {/* Permissions */}
                <div className='mb-6'>
                    <div className='flex items-center justify-between mb-3'>
                        <label className='text-xs font-bold text-gray-300'>Permissions</label>
                        <div className='flex gap-2'>
                            <button onClick={() => setSelectedPerms(Object.keys(permissions))} className='text-[10px] font-bold text-blue-400 hover:text-blue-300 transition cursor-pointer'>Select All</button>
                            <span className='text-gray-700'>|</span>
                            <button onClick={() => setSelectedPerms([])} className='text-[10px] font-bold text-gray-400 hover:text-white transition cursor-pointer'>Clear</button>
                        </div>
                    </div>
                    {Object.entries(grouped).map(([category, perms]) => (
                        <div key={category} className='mb-4'>
                            <p className='text-[10px] font-extrabold uppercase tracking-widest text-gray-500 mb-2'>{category}</p>
                            <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                                {perms.map(([key, meta]) => (
                                    <PermissionToggle
                                        key={key}
                                        permKey={key}
                                        meta={meta}
                                        checked={selectedPerms.includes(key)}
                                        onChange={togglePerm}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className='flex justify-end gap-3 pt-4 border-t border-white/8'>
                    <button onClick={onClose} className='px-5 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer'>Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className='px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-t from-blue-600 to-blue-500 border border-blue-500 text-white shadow-lg shadow-blue-900/40 transition cursor-pointer active:scale-95 disabled:opacity-50'
                    >
                        {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Role'}
                    </button>
                </div>
            </div>
        </Modal>
    )
}

// ─── Main container ───────────────────────────────────────────────────────────

const AdminRolesContainer = () => {
    const isCeo = useIsCeo()

    const [roles, setRoles] = useState<AdminRole[]>([])
    const [perms, setPerms] = useState<Record<string, PermissionMeta>>({})
    const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'roles' | 'assignments'>('roles')

    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<AdminRole | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<AdminRole | null>(null)
    const [deletingId, setDeletingId] = useState<number | null>(null)

    const [assigning, setAssigning] = useState<Record<number, boolean>>({})

    const load = async () => {
        setLoading(true)
        try {
            const [r, p, u] = await Promise.all([getRoles(), getPermissions(), getAdminUsers()])
            setRoles(r)
            setPerms(p)
            setAdminUsers(u)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const handleDelete = async (role: AdminRole) => {
        setDeletingId(role.id)
        try {
            await deleteRole(role.id)
            await load()
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to delete role.')
        } finally {
            setDeletingId(null)
            setConfirmDelete(null)
        }
    }

    const handleAssign = async (userId: number, roleId: number | null) => {
        setAssigning(prev => ({ ...prev, [userId]: true }))
        try {
            await assignRole(userId, roleId)
            await load()
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to assign role.')
        } finally {
            setAssigning(prev => ({ ...prev, [userId]: false }))
        }
    }

    const [togglingIp, setTogglingIp] = useState<Record<number, boolean>>({})

    const handleToggleIpPrivacy = async (userId: number, hideIp: boolean) => {
        setTogglingIp(prev => ({ ...prev, [userId]: true }))
        try {
            await toggleUserIpPrivacy(userId, hideIp)
            setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, hide_ip_in_audit: hideIp } : u))
        } catch (e: any) {
            alert(e.response?.data?.message || 'Failed to toggle IP privacy.')
        } finally {
            setTogglingIp(prev => ({ ...prev, [userId]: false }))
        }
    }

    return (
        <PageContentBlock title='Admin › Roles'>
            {/* Page header */}
            <div className='mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-5'>
                <div>
                    <h1 className='text-2xl font-extrabold text-white tracking-tight flex items-center gap-2'>
                        <ShieldCheckIcon className='w-7 h-7 text-indigo-400' />
                        Admin Roles &amp; Permissions
                    </h1>
                    <p className='text-xs text-gray-400 mt-1'>
                        Create roles, configure their permissions, and assign them to admin users.
                        {!isCeo && <span className='ml-2 text-amber-400 font-semibold'>⚠ Read-only — only the Super Admin can make changes.</span>}
                    </p>
                </div>
                {isCeo && (
                    <button
                        onClick={() => { setEditing(null); setFormOpen(true) }}
                        className='flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 transition cursor-pointer'
                    >
                        <PlusIcon className='w-4 h-4' /> New Role
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className='flex gap-1 mb-6 bg-neutral-900/60 border border-white/8 rounded-xl p-1 w-fit'>
                {(['roles', 'assignments'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-5 py-2 rounded-lg text-xs font-bold transition cursor-pointer capitalize ${
                            activeTab === tab
                                ? 'bg-white/10 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        {tab === 'roles' ? '🛡 Roles' : '👥 User Assignments'}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                    {[1,2,3].map(i => (
                        <div key={i} className='h-52 rounded-2xl bg-neutral-900/60 border border-white/8 animate-pulse' />
                    ))}
                </div>
            ) : activeTab === 'roles' ? (
                /* ── ROLES TAB ── */
                <div>
                    {roles.length === 0 ? (
                        <div className='flex flex-col items-center justify-center py-20 text-center'>
                            <ShieldCheckIcon className='w-12 h-12 text-gray-600 mb-3' />
                            <p className='text-gray-400 font-semibold'>No roles created yet.</p>
                            {isCeo && <p className='text-xs text-gray-600 mt-1'>Click "New Role" to get started.</p>}
                        </div>
                    ) : (
                        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                            {roles.map(role => (
                                <div
                                    key={role.id}
                                    className='bg-neutral-900/70 border border-white/8 rounded-2xl p-5 flex flex-col gap-4 hover:border-white/15 transition-all shadow-xl shadow-black/20'
                                >
                                    {/* Header */}
                                    <div className='flex items-start justify-between gap-2'>
                                        <div className='flex items-center gap-2.5'>
                                            <div className='w-9 h-9 rounded-xl flex items-center justify-center shrink-0' style={{ backgroundColor: role.color + '20', border: `1px solid ${role.color}55` }}>
                                                <ShieldCheckIcon className='w-4.5 h-4.5' style={{ color: role.color }} />
                                            </div>
                                            <div>
                                                <p className='font-extrabold text-white text-sm leading-tight'>{role.name}</p>
                                                <p className='text-[10px] text-gray-500 mt-0.5'>
                                                    {role.users_count} user{role.users_count !== 1 ? 's' : ''} assigned
                                                </p>
                                            </div>
                                        </div>
                                        <RoleBadge name={`${role.permissions.length} perms`} color={role.color} />
                                    </div>

                                    {/* Description */}
                                    {role.description && (
                                        <p className='text-xs text-gray-400 leading-relaxed'>{role.description}</p>
                                    )}

                                    {/* Permissions preview */}
                                    <div className='flex flex-wrap gap-1.5'>
                                        {role.permissions.slice(0, 6).map(p => (
                                            <span key={p} className='px-2 py-0.5 rounded-lg bg-white/5 border border-white/8 text-[10px] font-mono text-gray-400'>
                                                {p}
                                            </span>
                                        ))}
                                        {role.permissions.length > 6 && (
                                            <span className='px-2 py-0.5 rounded-lg bg-white/5 border border-white/8 text-[10px] text-gray-500'>
                                                +{role.permissions.length - 6} more
                                            </span>
                                        )}
                                        {role.permissions.length === 0 && (
                                            <span className='text-[10px] text-gray-600 italic'>No permissions assigned</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    {isCeo && (
                                        <div className='flex gap-2 mt-auto pt-3 border-t border-white/6'>
                                            <button
                                                onClick={() => { setEditing(role); setFormOpen(true) }}
                                                className='flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-white/5 hover:bg-white/10 border border-white/8 text-gray-300 hover:text-white transition cursor-pointer'
                                            >
                                                <PencilSquareIcon className='w-3.5 h-3.5' /> Edit
                                            </button>
                                            <button
                                                onClick={() => setConfirmDelete(role)}
                                                disabled={deletingId === role.id}
                                                className='flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 hover:text-rose-300 transition cursor-pointer disabled:opacity-50'
                                            >
                                                <TrashIcon className='w-3.5 h-3.5' />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* ── ASSIGNMENTS TAB ── */
                <div className='bg-neutral-900/70 border border-white/8 rounded-2xl overflow-hidden shadow-xl'>
                    <div className='flex items-center gap-3 p-5 border-b border-white/8'>
                        <UserGroupIcon className='w-5 h-5 text-indigo-400' />
                        <div>
                            <h2 className='text-sm font-extrabold text-white'>Admin User Assignments</h2>
                            <p className='text-xs text-gray-400'>Assign or remove roles from admin users. The Super Admin always has full access.</p>
                        </div>
                    </div>

                    <div className='divide-y divide-white/5'>
                        {adminUsers.length === 0 && (
                            <p className='text-xs text-gray-500 italic p-6 text-center'>No admin users found.</p>
                        )}
                        {adminUsers.map(u => (
                            <div key={u.id} className='flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-white/[0.02] transition'>
                                <div className='flex items-center gap-3 min-w-0'>
                                    <div className='w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0'>
                                        <UserCircleIcon className='w-5 h-5 text-indigo-300' />
                                    </div>
                                    <div className='min-w-0'>
                                        <p className='text-sm font-bold text-white truncate'>{u.name}</p>
                                        <p className='text-[11px] text-gray-500 truncate'>{u.email}</p>
                                    </div>
                                </div>

                                <div className='flex items-center gap-3'>
                                    {isCeo && (
                                        <button
                                            type='button'
                                            onClick={() => handleToggleIpPrivacy(u.id, !u.hide_ip_in_audit)}
                                            disabled={togglingIp[u.id]}
                                            title={u.hide_ip_in_audit ? 'IP is hidden in audit logs. Click to make visible.' : 'IP is visible in audit logs. Click to hide.'}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer active:scale-95 disabled:opacity-50 ${
                                                u.hide_ip_in_audit
                                                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                                                    : 'bg-neutral-800 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                                            }`}
                                        >
                                            {u.hide_ip_in_audit ? (
                                                <>
                                                    <EyeSlashIcon className='w-3.5 h-3.5 text-amber-400' />
                                                    <span>IP Hidden</span>
                                                </>
                                            ) : (
                                                <>
                                                    <EyeIcon className='w-3.5 h-3.5 text-gray-400' />
                                                    <span>IP Visible</span>
                                                </>
                                            )}
                                        </button>
                                    )}

                                    {u.is_super_admin ? (
                                        <span className='flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold'>
                                            <CheckBadgeIcon className='w-3.5 h-3.5' /> Super Admin
                                        </span>
                                    ) : (
                                        <>
                                            {u.admin_role_name && (
                                                <RoleBadge name={u.admin_role_name} color={u.admin_role_color ?? '#6366f1'} />
                                            )}
                                            {!u.admin_role_name && (
                                                <span className='text-[11px] text-gray-500 italic'>Full access (no role)</span>
                                            )}
                                            {isCeo && (
                                                <select
                                                    value={u.admin_role_id ?? ''}
                                                    disabled={assigning[u.id]}
                                                    onChange={e => handleAssign(u.id, e.target.value ? Number(e.target.value) : null)}
                                                    className='px-3 py-1.5 rounded-xl text-[11px] font-bold bg-neutral-800 border border-white/10 text-white focus:outline-none focus:border-indigo-500 transition cursor-pointer disabled:opacity-50'
                                                >
                                                    <option value=''>— No role (full access)</option>
                                                    {roles.map(r => (
                                                        <option key={r.id} value={r.id}>{r.name}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Role form modal */}
            <RoleFormModal
                opened={formOpen}
                onClose={() => setFormOpen(false)}
                onSaved={load}
                permissions={perms}
                editing={editing}
            />

            {/* Delete confirmation modal */}
            <Modal
                opened={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                title={null}
                size='sm'
                centered
                withCloseButton={false}
                padding={0}
                radius={16}
                styles={{
                    content: { backgroundColor: '#0a0c12', border: '1px solid rgba(255,255,255,0.08)' },
                    body: { padding: 0 },
                    overlay: { backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' },
                }}
            >
                {confirmDelete && (
                    <div className='p-6'>
                        <div className='w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mb-4'>
                            <TrashIcon className='w-6 h-6 text-rose-400' />
                        </div>
                        <h3 className='text-base font-extrabold text-white mb-1'>Delete "{confirmDelete.name}"?</h3>
                        <p className='text-xs text-gray-400 leading-relaxed mb-5'>
                            All {confirmDelete.users_count} user(s) assigned to this role will revert to full admin access.
                            This cannot be undone.
                        </p>
                        <div className='flex gap-3'>
                            <button onClick={() => setConfirmDelete(null)} className='flex-1 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/8 transition cursor-pointer'>
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(confirmDelete)}
                                disabled={deletingId === confirmDelete.id}
                                className='flex-1 py-2.5 rounded-xl text-xs font-bold bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 hover:text-rose-300 transition cursor-pointer disabled:opacity-50'
                            >
                                {deletingId === confirmDelete.id ? 'Deleting...' : 'Delete Role'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </PageContentBlock>
    )
}

export default AdminRolesContainer
